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

  if (field) result.push(field.trim().replace(/^"|"$/g, ''));

  return result;
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

  // 程序启动时读取一次配置和名单（保持主界面人数正常）
  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        console.log('程序启动 - 加载 settings.json...');

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
      const settingsRes = await fetch('/configuration/settings.json', { cache: 'no-store' });
      if (!settingsRes.ok) throw new Error(`settings.json 加载失败 ${settingsRes.status}`);

      const rawSettings = await settingsRes.json();
      const cleanSettings = Object.fromEntries(
        Object.entries(rawSettings).filter(([k]) => !k.startsWith('//'))
      );
      setSettings(cleanSettings);

      // 重新读取 participants.csv
      const csvPath = cleanSettings.participants || 'configuration/participants.csv';
      console.log('重新读取参与者名单:', csvPath);
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

      if (data.length === 0) throw new Error('名单中没有有效参与者');

      setParticipants(data);
      console.log(`重新读取完成，有效人数: ${data.length}`);

      // 生成奖项列表
      const valid = prizeDefs
        .map(p => ({ ...p, total: Number(cleanSettings[p.key] ?? 0) }))
        .filter(p => p.total > 0);

      if (valid.length === 0) throw new Error('配置中没有有效奖项');

      setValidPrizes(valid);

      // 生成全新的 CSV 文件（完全照抄你稳定版的创建方式：writeTextFile + exists 检查）
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
        } else {
          console.log(`新文件已存在（极少发生）: ${fullFilePath}`);
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

      const available = participants.filter(p => !usedIds.has(p.id));

      if (available.length < currentPrize.total) {
        alert(`剩余可用人数 (${available.length}) 不足以抽出 ${currentPrize.total} 人！`);
        setScreen('prize_guide');
        return;
      }

      const shuffled = [...available].sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, currentPrize.total);

      setUsedIds(prev => {
        const next = new Set(prev);
        winners.forEach(w => next.add(w.id));
        return next;
      });

      setCurrentRoundWinners(winners);
      setScreen('result');

      // 写入结果文件（你稳定版原封不动）
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
          // await file.close();  // 你稳定版去掉了，没问题

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

    // 新增：刷新配置按钮逻辑（和启动加载完全一致的检查）
  const refreshConfig = async () => {
    setLoading(true);
    try {
      console.log('手动刷新配置...');

      const settingsRes = await fetch('/configuration/settings.json', { cache: 'no-store' });
      if (!settingsRes.ok) throw new Error(`settings.json 加载失败 ${settingsRes.status}`);

      const rawSettings = await settingsRes.json();
      const cleanSettings = Object.fromEntries(
        Object.entries(rawSettings).filter(([k]) => !k.startsWith('//'))
      );

      const csvPath = cleanSettings.participants || 'configuration/participants.csv';
      const csvRes = await fetch(`/${csvPath}?t=${Date.now()}`, { cache: 'no-store' });
      if (!csvRes.ok) throw new Error(`participants.csv 加载失败 ${csvRes.status}`);

      const csvText = await csvRes.text();
      const lines = csvText.split(/\r?\n/);
      const filteredLines = lines.map(l => l.trim()).filter(l => l && !l.startsWith('#'));

      if (filteredLines.length < 2) throw new Error('CSV 文件没有有效数据（至少需要表头 + 1行数据）');

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

      if (data.length === 0) throw new Error('名单中没有有效参与者（缺少 id 字段或全部被过滤）');

      // 更新状态
      setSettings(cleanSettings);
      setParticipants(data);

      const valid = prizeDefs
        .map(p => ({ ...p, total: Number(cleanSettings[p.key] ?? 0) }))
        .filter(p => p.total > 0);

      setValidPrizes(valid);

      console.log(`刷新成功！有效人数: ${data.length} 人，有效奖项: ${valid.length} 个`);
      alert(`✅ 配置已刷新！\n\n当前参与人数：${data.length} 人\n有效奖项：${valid.map(p => p.name).join('、') || '无'}`);

    } catch (err) {
      console.error('刷新配置失败:', err);
      alert(`❌ 刷新失败：\n${err.message}\n\n请检查 configuration/settings.json 和 participants.csv 文件是否正确！`);
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

        {/* 右上角按钮组：Refresh 在左，About 在右 */}
        <div className="header-buttons">
          <button 
            className="refresh-button"
            onClick={refreshConfig}
            disabled={loading}
          >
            {loading ? '刷新中...' : '↻ 刷新配置'}
          </button>
          
          <button 
            className="about-button"
            onClick={() => alert('年会抽奖桌面程序 v1.0\n作者：yangzibox\nGitHub: https://github.com/yangzibox/work')}
          >
            About
          </button>
        </div>

        <button className="start-button" onClick={enterFullscreen} disabled={loading}>
          {loading ? '加载中...' : '开始抽奖（全屏）'}
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