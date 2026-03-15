import { useState, useEffect } from 'react';
import './App.css';

// 简单 CSV 行解析（支持带引号的字段）
const parseCSVLine = (line) => {
  const result = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(field.trim().replace(/^"|"$/g, ''));
      field = '';
      continue;
    }

    field += char;
  }

  if (field) {
    result.push(field.trim().replace(/^"|"$/g, ''));
  }

  return result;
};

const prizeDefs = [
  { key: 'hotpot-prize', name: '火锅奖' },
  { key: '6th-prize', name: '六等奖' },
  { key: '5th-prize', name: '五等奖' },
  { key: '4th-prize', name: '四等奖' },
  { key: '3rd-prize', name: '三等奖' },
  { key: '2nd-prize', name: '二等奖' },
  { key: '1st-prize', name: '一等奖' },
  { key: 'grand-prize', name: '特等奖' },
];

let resultFilePath = null; // 全局保存文件相对路径

function App() {
  const [screen, setScreen] = useState('loading');
  const [participants, setParticipants] = useState([]);
  const [settings, setSettings] = useState({});
  const [validPrizes, setValidPrizes] = useState([]);
  const [currentPrizeIndex, setCurrentPrizeIndex] = useState(0);
  const [usedIds, setUsedIds] = useState(new Set());
  const [currentRoundWinners, setCurrentRoundWinners] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  const isTauri = !!window.__TAURI__;

  // 加载配置 + 名单
  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        console.log('🚀 开始加载 settings.json...');

        const settingsRes = await fetch('/configuration/settings.json', { cache: 'no-store' });
        if (!settingsRes.ok) throw new Error(`settings.json 加载失败 ${settingsRes.status}`);

        const rawSettings = await settingsRes.json();
        const cleanSettings = Object.fromEntries(
          Object.entries(rawSettings).filter(([k]) => !k.startsWith('//'))
        );
        setSettings(cleanSettings);

        const csvPath = cleanSettings.participants || 'configuration/participants.csv';
        const csvRes = await fetch(`/${csvPath}?t=${Date.now()}`, { cache: 'no-store' });
        if (!csvRes.ok) throw new Error(`participants.csv 加载失败 ${csvRes.status}`);

        const csvText = await csvRes.text();
        const lines = csvText.split(/\r?\n/);
        const filteredLines = lines.map(l => l.trim()).filter(l => l && !l.startsWith('#'));

        if (filteredLines.length < 2) throw new Error('CSV 文件没有有效数据');

        const headers = parseCSVLine(filteredLines[0]);
        const readMax = Number(cleanSettings.read_fields_max || 4);

        const data = filteredLines.slice(1).map(line => {
          const values = parseCSVLine(line);
          const row = {};
          for (let i = 0; i < Math.min(values.length, readMax); i++) {
            row[headers[i] || `col${i}`] = (values[i] || '').trim();
          }
          return row;
        }).filter(row => row.id && row.id.trim() !== '' && !row.id.startsWith('#'));

        console.log(`✅ 解析完成！有效人数: ${data.length} 人`);
        setParticipants(data);

        const valid = prizeDefs
          .map(p => ({ ...p, total: Number(cleanSettings[p.key] ?? 0) }))
          .filter(p => p.total > 0);

        setValidPrizes(valid);
        setScreen('ready');

      } catch (err) {
        console.error('❌ 加载失败:', err);
        alert('加载失败：' + err.message + '\n\n请检查 configuration 目录下的文件！');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // 初始化 output 目录和结果文件（Tauri v2 兼容版）
  useEffect(() => {
    if (!isTauri) return;

    const initOutputFile = async () => {
      try {
        const fs = await import('@tauri-apps/plugin-fs');
        const { mkdir, exists, writeTextFile, BaseDirectory } = fs;

        const ts = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
        const fileName = `result_${ts}.csv`;
        const dirPath = 'output';
        const fullFilePath = `${dirPath}/${fileName}`;

        console.log('🔧 初始化 output 目录... 使用 BaseDirectory.AppLocalData');

        // 创建 output 目录
        await mkdir(dirPath, {
          baseDir: BaseDirectory.AppLocalData,
          recursive: true,
        });
        console.log('✅ output 目录已创建/存在');

        // 检查并创建 CSV + 表头
        const fileExists = await exists(fullFilePath, { baseDir: BaseDirectory.AppLocalData });
        if (!fileExists) {
          const header = '奖项,抽奖时间,员工号,姓名,职务,部门\n';
          await writeTextFile(fullFilePath, header, {
            baseDir: BaseDirectory.AppLocalData,
          });
          console.log(`✅ 结果文件创建成功: ${fullFilePath}`);
        } else {
          console.log(`文件已存在: ${fullFilePath}`);
        }

        resultFilePath = fullFilePath;
        console.log('🎯 输出文件路径准备完成');
      } catch (err) {
        console.error('❌ output 初始化失败:', err);
        console.log('错误名字:', err.name, '消息:', err.message);
        alert('创建 output 失败！请查看控制台错误（常见：权限未配置或路径问题）');
      }
    };

    initOutputFile();
  }, [isTauri]);

  // 滚动定时器（加速版，80ms 一帧）
  useEffect(() => {
    if (screen !== 'rolling' || participants.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % participants.length);
    }, 80);

    return () => clearInterval(timer);
  }, [screen, participants]);

  // 键盘 + 全屏事件
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isFullscreen) return;
      if (e.key === ' ') {
        e.preventDefault();
        handleSpace();
      }
      if (e.key === 'Escape') {
        document.exitFullscreen?.();
      }
    };

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull) {
        // 退出全屏时重置所有抽奖状态
        setScreen('ready');
        setCurrentPrizeIndex(0);
        setUsedIds(new Set());
        setCurrentRoundWinners([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen, screen, currentPrizeIndex, validPrizes, participants, usedIds]);

  const enterFullscreen = () => {
    setCurrentPrizeIndex(0);
    setUsedIds(new Set());
    setCurrentRoundWinners([]);
    document.documentElement.requestFullscreen?.();
    setScreen('prize_guide');
  };

  const handleSpace = async () => {
    if (screen === 'prize_guide') {
      setScreen('rolling');
      return;
    }

    if (screen === 'rolling') {
      const currentPrize = validPrizes[currentPrizeIndex];
      if (!currentPrize) return;

      const available = participants.filter(p => !usedIds.has(p.id));

      if (available.length < currentPrize.total) {
        alert(`剩余可用人数 (${available.length}) 不足以抽出 ${currentPrize.total} 人！`);
        setScreen('prize_guide');
        return;
      }

      // 随机抽取（洗牌后取前 N 个）
      const shuffled = [...available].sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, currentPrize.total);

      setUsedIds(prev => {
        const next = new Set(prev);
        winners.forEach(w => next.add(w.id));
        return next;
      });

      setCurrentRoundWinners(winners);
      setScreen('result');

      // 写入文件
      if (isTauri && resultFilePath) {
        try {
          const fs = await import('@tauri-apps/plugin-fs');
          const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

          const lines = winners.map(w => {
            const fields = [
              currentPrize.name,
              now,
              w.id || '',
              w.name || '',
              w.职务 || '',
              w.部门 || ''
            ];
            return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',');
          });

          const content = lines.join('\n') + '\n';

          await fs.appendTextFile(resultFilePath, content, {
            baseDir: fs.BaseDirectory.AppLocalData
          });

          console.log(`✅ 已写入 ${currentPrize.name} 的 ${winners.length} 条记录`);
        } catch (err) {
          console.error('❌ 写入失败:', err);
        }
      } else {
        console.log('[浏览器模式] 本轮中奖:', winners);
      }

      return;
    }

    // result 界面按空格 → 下一轮或结束
    if (screen === 'result') {
      setCurrentRoundWinners([]);
      const nextIndex = currentPrizeIndex + 1;

      if (nextIndex >= validPrizes.length) {
        setScreen('finish');
      } else {
        setCurrentPrizeIndex(nextIndex);
        setScreen('prize_guide');
      }
    }
  };

  const currentPrize = validPrizes[currentPrizeIndex] || {};
  const currentPerson = participants[currentIndex] || {};
  const displayText = Array(settings.display_fields || 2)
    .fill('')
    .map((_, i) => Object.values(currentPerson)[i] || '')
    .filter(Boolean)
    .join('　');

  if (loading) return <div className="main-screen">加载中...</div>;

  if (!isFullscreen) {
    return (
      <div className="main-screen">
        <h2>年会抽奖系统</h2>
        <button className="start-button" onClick={enterFullscreen}>
          开始抽奖
        </button>
        <p>参与人数：{participants.length} 人</p>
        <button
          onClick={() => {
            navigator.clipboard.writeText('yangzibox@163.com');
            alert('邮箱已复制！');
          }}
        >
          About
        </button>
      </div>
    );
  }

  if (screen === 'finish') {
    return (
      <div className="fullscreen">
        <h1 className="finish-title">抽奖结束！</h1>
        <p className="tips">感谢参与 • Esc 退出全屏</p>
      </div>
    );
  }

  if (screen === 'result') {
    return (
      <div className="fullscreen result-screen">
        <h1>恭喜以下幸运儿！</h1>
        <div className="winners-grid">
          {currentRoundWinners.map((w, i) => (
            <div key={w.id} className="winner-item">
              <div className="winner-name">{w.name}</div>
              <div className="winner-id">{w.id}</div>
              <div className="winner-extra">
                {w.职务 || ''} {w.部门 || ''}
              </div>
            </div>
          ))}
        </div>
        <p className="tips">空格键 → 继续下一轮　　Esc → 退出</p>
      </div>
    );
  }

  return (
    <div className="fullscreen">
      {screen === 'prize_guide' ? (
        <>
          <h1 className="guide-title">
            下面抽取 <span className="prize-name">{currentPrize.name}</span>
          </h1>
          <h2 className="guide-count">名额 {currentPrize.total} 人</h2>
          <p className="tips">空格键开始滚动　　Esc 退出全屏</p>
        </>
      ) : (
        <>
          <h1 className={screen === 'rolling' ? 'rolling-text' : ''}>
            {displayText || '准备中...'}
          </h1>
          <p className="tips">空格键停止　　Esc 退出全屏</p>
        </>
      )}
    </div>
  );
}

export default App;