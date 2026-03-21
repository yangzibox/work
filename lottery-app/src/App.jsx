import { useState, useEffect, useRef } from 'react';
import { appLocalDataDir } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
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

  if (field) result.push(field.trim().replace(/^"|"$/g, ''));

  return result;
};

// 字符串解析 CSV（替换原来的 fetch 版）
const parseParticipantsCSVFromString = (csvText) => {
  const lines = csvText.split(/\r?\n/);

  const filteredLines = lines
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  if (filteredLines.length < 1) throw new Error('CSV 文件没有有效数据');

  let headers = ['id', 'name', '职务', '部门'];
  let dataStartIndex = 0;

  const firstLine = filteredLines[0];
  const likelyHeader = firstLine.includes('id') || 
                       firstLine.includes('姓名') || 
                       firstLine.includes('name') || 
                       firstLine.includes('员工号') || 
                       firstLine.includes('工号') || 
                       firstLine.includes('职务') || 
                       firstLine.includes('部门');

  if (likelyHeader) {
    headers = parseCSVLine(firstLine);
    dataStartIndex = 1;
  }

  const data = filteredLines.slice(dataStartIndex).map(line => {
    const values = parseCSVLine(line);
    if (values.length < 2) return null;

    const row = {
      id: (values[0] || '').trim(),
      name: (values[1] || '').trim(),
      职务: (values[2] || '').trim(),
      部门: (values[3] || '').trim(),
    };

    for (let i = 4; i < Math.min(values.length, 4); i++) {
      row[`col${i}`] = (values[i] || '').trim();
    }

    return row;
  }).filter(row => row && row.id && row.id.trim() !== '' && !row.id.startsWith('#'));

  if (data.length === 0) throw new Error('名单中没有有效参与者');

  return data;
};

// 奖项定义
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

let resultFilePath = null;

function App() {
  const bgmRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);

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

  const [pred1stId, setPred1stId] = useState('');
  const [predGrandId, setPredGrandId] = useState('');

  const isTauri = !!window.__TAURI__;

  // 从 Rust 读取配置文件（dev 读 public/，release 读 resources/）
  const loadConfigFile = async (fileName) => {
    try {
      const content = await invoke('read_config_file', { fileName });
      return content;
    } catch (err) {
      console.error(`读取 ${fileName} 失败:`, err);
      throw err;
    }
  };

  // 加载 settings.json
  const loadSettings = async () => {
    const text = await loadConfigFile('settings.json');
    return JSON.parse(text);
  };

  // 加载 participants.csv
  const loadParticipantsCsv = async () => {
    return await loadConfigFile('participants.csv');
  };

  useEffect(() => {
    if (!bgmRef.current) {
      bgmRef.current = new Audio('/sounds/chinese-short-epic-30s.mp3');
      bgmRef.current.loop = true;
      bgmRef.current.volume = isMuted ? 0 : 0.35;
      console.log('背景音乐实例已创建');
    }

    bgmRef.current.volume = isMuted ? 0 : 0.35;

    if (isFullscreen) {
      bgmRef.current.play().catch(err => {
        console.log('背景音乐自动播放被阻止:', err);
      });
    } else {
      bgmRef.current?.pause();
    }

    return () => {
      bgmRef.current?.pause();
    };
  }, [isFullscreen, isMuted]);

  // 程序启动时读取一次配置和名单
  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        console.log('程序启动 - 加载 settings.json...');

        const rawSettings = await loadSettings();
        const cleanSettings = Object.fromEntries(
          Object.entries(rawSettings).filter(([k]) => !k.startsWith('//'))
        );
        setSettings(cleanSettings);

        const csvPath = cleanSettings.participants || 'configuration/participants.csv';
        const readMax = Number(cleanSettings.read_fields_max || 4);
        const csvText = await loadParticipantsCsv();
        const data = parseParticipantsCSVFromString(csvText);

        console.log(`解析完成！有效人数: ${data.length} 人`);
        setParticipants(data);

        const valid = prizeDefs
          .map(p => ({ ...p, total: Number(cleanSettings[p.key] ?? 0) }))
          .filter(p => p.total > 0);

        setValidPrizes(valid);
        setScreen('ready');

      } catch (err) {
        console.error('❌ 启动加载失败:', err);
        alert('启动加载失败：' + err.message + '\n\n请检查 configuration 目录下的文件！');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // 滚动定时器
  useEffect(() => {
    if (screen !== 'rolling' || participants.length === 0) return;

    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % participants.length);
    }, 80);

    return () => clearInterval(timer);
  }, [screen, participants]);

  // 键盘和全屏事件
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

  const enterFullscreen = async () => {
    setLoading(true);
    try {
      // 重新读取 settings.json
      console.log('点击开始抽奖 - 重新读取 settings.json...');
      const rawSettings = await loadSettings();
      const cleanSettings = Object.fromEntries(
        Object.entries(rawSettings).filter(([k]) => !k.startsWith('//'))
      );
      setSettings(cleanSettings);
      setPred1stId(cleanSettings['1st-prize-pred'] || '');
      setPredGrandId(cleanSettings['grand-prize-pred'] || '');

      // 重新读取 participants.csv
      const csvPath = cleanSettings.participants || 'configuration/participants.csv';
      console.log('重新读取参与者名单:', csvPath);
      const readMax = Number(cleanSettings.read_fields_max || 4);
      const csvText = await loadParticipantsCsv();
      const data = parseParticipantsCSVFromString(csvText);

      if (data.length === 0) throw new Error('名单中没有有效参与者');

      setParticipants(data);
      console.log(`重新读取完成，有效人数: ${data.length}`);

      // 使用和手动刷新相同的严格校验
      let newValidPrizes;
      try {
        const result = validatePrizes(cleanSettings);
        newValidPrizes = result.validPrizes;
        setValidPrizes(newValidPrizes);
      } catch (err) {
        alert(`❌ 开始抽奖校验失败：\n\n${err.message}\n\n请修正 settings.json 后再尝试开始抽奖！`);
        setScreen('ready');
        setLoading(false);
        return;
      }

      if (newValidPrizes.length === 0) {
        alert(`❌ 配置中没有有效奖项（所有奖项数量均为 0）\n\n请检查 settings.json 并至少设置一个奖项！`);
        setScreen('ready');
        setLoading(false);
        return;
      }

      // 生成全新的 CSV 文件
      if (isTauri) {
        const fs = await import('@tauri-apps/plugin-fs');
        const { mkdir, exists, writeTextFile, BaseDirectory } = fs;

        const ts = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
        const fileName = `result_${ts}.csv`;
        const dirPath = 'output';
        const fullFilePath = `${dirPath}/${fileName}`;

        console.log(`点击开始抽奖 - 创建新结果文件: ${fullFilePath}`);

        await mkdir(dirPath, {
          baseDir: BaseDirectory.AppLocalData,
          recursive: true,
        });

        const fileExists = await exists(fullFilePath, { baseDir: BaseDirectory.AppLocalData });
        if (!fileExists) {
          const header = '\uFEFF奖项,抽奖时间,员工号,姓名,职务,部门\n';
          await writeTextFile(fullFilePath, header, {
            baseDir: BaseDirectory.AppLocalData,
          });
          console.log(`新文件创建并写入表头: ${fullFilePath}`);
        }

        resultFilePath = fullFilePath;
        console.log('本次抽奖新文件路径已设置:', resultFilePath);
      }

      // 重置状态并进入全屏
      setCurrentPrizeIndex(0);
      setUsedIds(new Set());
      setCurrentRoundWinners([]);
      setScreen('prize_guide');
      await document.documentElement.requestFullscreen();
      document.documentElement.style.width = '100vw';
      document.documentElement.style.height = '100vh';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';

    } catch (err) {
      console.error('开始抽奖失败:', err);
      alert('开始抽奖失败：\n' + (err.message || '未知错误') + '\n\n请检查 configuration 目录下的文件！');
    } finally {
      setLoading(false);
    }
  };

  const handleSpace = async () => {
    if (screen === 'prize_guide') {
      setScreen('rolling');
      return;
    }

    if (screen === 'rolling') {
      const currentPrize = validPrizes[currentPrizeIndex];
      if (!currentPrize) return;

      let available = participants.filter(p => !usedIds.has(p.id));

      if (pred1stId && currentPrize.key !== '1st-prize') {
        available = available.filter(p => p.id !== pred1stId);
      }
      if (predGrandId && currentPrize.key !== 'grand-prize') {
        available = available.filter(p => p.id !== predGrandId);
      }

      if (available.length < currentPrize.total) {
        alert(`剩余可用人数 (${available.length}) 不足以抽出 ${currentPrize.total} 人！`);
        setScreen('prize_guide');
        return;
      }

      let winners = [];

      if (currentPrize.key === '1st-prize' && pred1stId) {
        const predPerson = participants.find(p => p.id === pred1stId);
        if (predPerson && available.some(p => p.id === pred1stId)) {
          winners.push(predPerson);
          console.log(`一等奖内定中奖：${predPerson.name} (${predPerson.id})`);

          if (currentPrize.total > 1) {
            const remaining = available.filter(p => p.id !== pred1stId);
            const shuffled = [...remaining].sort(() => Math.random() - 0.5);
            winners = winners.concat(shuffled.slice(0, currentPrize.total - 1));
          }
        }
      } else if (currentPrize.key === 'grand-prize' && predGrandId) {
        const predPerson = participants.find(p => p.id === predGrandId);
        if (predPerson && available.some(p => p.id === predGrandId)) {
          winners.push(predPerson);
          console.log(`特等奖内定中奖：${predPerson.name} (${predPerson.id})`);

          if (currentPrize.total > 1) {
            const remaining = available.filter(p => p.id !== predGrandId);
            const shuffled = [...remaining].sort(() => Math.random() - 0.5);
            winners = winners.concat(shuffled.slice(0, currentPrize.total - 1));
          }
        }
      }

      if (winners.length === 0) {
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        winners = shuffled.slice(0, currentPrize.total);
      }

      setUsedIds(prev => {
        const next = new Set(prev);
        winners.forEach(w => next.add(w.id));
        return next;
      });

      setCurrentRoundWinners(winners);
      setScreen('result');

      if (isTauri && resultFilePath) {
        try {
          const fs = await import('@tauri-apps/plugin-fs');
          const { open, BaseDirectory } = fs;

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

          const file = await open(resultFilePath, {
            baseDir: BaseDirectory.AppLocalData,
            append: true,
            create: true
          });

          await file.write(new TextEncoder().encode(content));

          console.log(`✅ 已追加 ${winners.length} 条记录到 ${resultFilePath}`);
        } catch (err) {
          console.error('❌ 写入失败:', err);
          alert('写入中奖结果失败，请查看控制台');
        }
      } else {
        console.log('[非 Tauri / 路径为空] 本轮中奖（未写入文件）:', winners);
      }

      return;
    }

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

  const validatePrizes = (cleanSettings) => {
    const prizesWithTotal = prizeDefs.map(p => ({
      ...p,
      total: Number(cleanSettings[p.key] ?? 0)
    }));

    const hotpotIndex = prizeDefs.findIndex(p => p.key === 'hotpot-prize');
    const firstPrizeIndex = prizeDefs.findIndex(p => p.key === '1st-prize');
    if (firstPrizeIndex === -1) {
      throw new Error('奖项定义中缺少 "1st-prize"');
    }

    const hotpotTotal = prizesWithTotal[hotpotIndex]?.total ?? 0;

    let startIdx = -1;
    for (let i = hotpotIndex + 1; i <= firstPrizeIndex; i++) {
      if (prizesWithTotal[i].total > 0) {
        startIdx = i;
        break;
      }
    }

    if (startIdx !== -1) {
      for (let i = startIdx; i <= firstPrizeIndex; i++) {
        if (prizesWithTotal[i].total <= 0) {
          const startName = prizesWithTotal[startIdx].name;
          const badName = prizesWithTotal[i].name;
          throw new Error(
            `奖项设置不连续！\n` +
            `从 "${startName}" 开始，到一等奖之间不能有数量为 0 的奖项。\n` +
            `问题奖项：${badName} (数量=0)`
          );
        }
      }
    } else {
      if (hotpotTotal <= 0) {
        const grandTotal = prizesWithTotal.find(p => p.key === 'grand-prize')?.total ?? 0;
        if (grandTotal <= 0) {
          throw new Error('所有奖项数量均为 0，至少设置一个奖项！');
        }
      }
    }

    const validPrizes = prizesWithTotal.filter(p => p.total > 0);
    return { validPrizes, prizesWithTotal };
  };

  const refreshConfig = async () => {
    setLoading(true);
    try {
      console.log('手动刷新配置...');

      const rawSettings = await loadSettings();
      const cleanSettings = Object.fromEntries(
        Object.entries(rawSettings).filter(([k]) => !k.startsWith('//'))
      );

      const csvText = await loadParticipantsCsv();
      const data = parseParticipantsCSVFromString(csvText);

      const { validPrizes: newValidPrizes } = validatePrizes(cleanSettings);

      setSettings(cleanSettings);
      setParticipants(data);
      setValidPrizes(newValidPrizes);

      alert(
        `✅ 配置刷新成功！\n\n` +
        `当前参与人数：${data.length} 人\n` +
        `将抽取的奖项：${newValidPrizes.map(p => `${p.name}(${p.total})`).join(' → ')}`
      );

    } catch (err) {
      console.error('刷新失败:', err);
      alert(`❌ 配置校验失败：\n\n${err.message}`);
    } finally {
      setLoading(false);
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
        
        <p>当前参与人数：{participants.length} 人</p>

        <div className="header-buttons">
          <button 
            className="refresh-button"
            onClick={refreshConfig}
            disabled={loading}
          >
            {loading ? '刷新中...' : '↻ 刷新配置'}
          </button>
          
          <button 
            className="about-btn"
            onClick={async () => {
              let outputPath = '获取失败，请手动搜索 output 文件夹';
              try {
                const appData = await appLocalDataDir();
                outputPath = `\n${appData}\n下的output目录`;
                console.log('成功获取路径：', outputPath);
              } catch (err) {
                console.error('获取路径失败:', err);
                outputPath = `错误：${err.message || '未知错误'}`;
              }

              alert(
                '年会抽奖桌面程序 v1.0\n' +
                '作者：yangzibox@163.com\n' +
                'GitHub: https://github.com/yangzibox/work\n\n' +
                `输出路径: ${outputPath}`
              );
            }}
          >
            关于
          </button>
        </div>

        <button className="start-button" onClick={enterFullscreen} disabled={loading}>
          {loading ? '加载中...' : '开始抽奖（全屏）'}
        </button>

        <div className="mute-toggle">
          <label>
            <input
              type="checkbox"
              checked={!isMuted}
              onChange={() => setIsMuted(prev => !prev)}
            />
            <span className="speaker-icon">{!isMuted ? '🔊' : '🔇'}</span>
          </label>
        </div>
      </div>
    );
  }

  if (screen === 'finish') {
    return (
      <div className="fullscreen">
        <h1 className="finish-title">抽奖结束</h1>
        <p className="tips">感谢参与 • Esc 退出全屏</p>
      </div>
    );
  }

  if (screen === 'result') {
    return (
      <div className="fullscreen result-screen bg-anim-active">
        <h1>恭喜以下幸运儿！</h1>

        <div 
          className={`winners-grid ${currentRoundWinners.length <= 12 ? 'center-mode' : 'scroll-mode'}`}
        >
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

        <p className="tips">空格键 → 继续下一轮　　Esc → 退出　　人数多时可滚动查看</p>
      </div>
    );
  }

  return (
    <div className={`fullscreen ${isFullscreen ? 'bg-anim-active' : ''}`}>
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