import { useState, useEffect, useRef } from 'react';
import { appLocalDataDir, resourceDir } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import './App.css';


// ====================== 打开系统文件夹（通用函数） ======================
const openSystemFolder = async (folderPath) => {
  if (!folderPath || typeof folderPath !== 'string') {
    alert('错误：路径为空，无法打开文件夹');
    return;
  }

  // 清理路径
  const cleanPath = folderPath.trim().replace(/^["']|["']$/g, '');

  try {
    await invoke('open_system_folder', { path: cleanPath });
    // 成功时不弹任何提示（安静打开）

  } catch (err) {
    const msg = err.toString().toLowerCase();

    if (msg.includes('not allowed') || msg.includes('permission')) {
      alert('打开失败：权限不足\n\n可能原因：\n1. 程序权限配置问题\n2. 杀毒软件拦截\n3. 请尝试以管理员身份运行程序');
    } 
    else if (msg.includes('not found') || msg.includes('no such')) {
      alert('打开失败：该文件夹路径不存在');
    } 
    else {
      alert(`打开文件夹失败\n\n${err.toString()}`);
    }
  }
};


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
const parseParticipantsCSVFromString = (csvText, maxFields = 4) => {
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

  const effectiveMax = Math.max(2, Number(maxFields));

  const data = filteredLines.slice(dataStartIndex).map(line => {
    let values = parseCSVLine(line);
    values = values.slice(0, effectiveMax);

    if (values.length < 2) return null;

    const row = {
      id: (values[0] || '').trim(),
      name: (values[1] || '').trim(),
      职务: values.length > 2 ? (values[2] || '').trim() : '',
      部门: values.length > 3 ? (values[3] || '').trim() : '',
    };

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
		const bootstrapGuard = useRef(false);
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

  // 关于弹窗状态
  const [showAbout, setShowAbout] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [resourcesPath, setResourcesPath] = useState('');

	const [versionText, setVersionText] = useState('');

  const isTauri = !!window.__TAURI__;

  // 从 Rust 读取配置文件
  const loadConfigFile = async (fileName) => {
    try {
      const content = await invoke('read_config_file', { fileName });
      return content;
    } catch (err) {
      console.error(`读取 ${fileName} 失败:`, err);
      throw err;
    }
  };

  const loadSettings = async () => {
    const text = await loadConfigFile('settings.json');
    return JSON.parse(text);
  };

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

  // 程序启动时读取配置和名单（加锁检查 + 密码）
useEffect(() => {
	if (bootstrapGuard.current) return;

  let handleKeyDown;

  if (import.meta.env.PROD) {
    handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") e.preventDefault();
      if (e.key === "F5") e.preventDefault();
      if (e.key === "F12") e.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
  }

  const bootstrap = async () => {
  bootstrapGuard.current = true;

  let cleanSettings = {};  // ★ 提前声明，避免 catch 里未定义

  setLoading(true);
  try {
    console.log('程序启动 - 先加载配置文件...');

    const rawSettings = await loadSettings();
    cleanSettings = Object.fromEntries(
      Object.entries(rawSettings).filter(([k]) => !k.startsWith('//'))
    );
    setSettings(cleanSettings);

    const csvText = await loadParticipantsCsv();
    const readMax = Number(cleanSettings.read_fields_max ?? 4);
    const data = parseParticipantsCSVFromString(csvText, readMax);

    console.log(`解析完成！有效人数: ${data.length} 人`);
    setParticipants(data);

    const valid = prizeDefs
      .map(p => ({ ...p, total: Number(cleanSettings[p.key] ?? 0) }))
      .filter(p => p.total > 0);

    setValidPrizes(valid);
    setScreen('ready');

  } catch (err) {
    console.error('❌ 配置文件加载失败:', err);
    alert('配置文件加载失败：' + err.message + '\n\n请检查 configuration 目录！');
  } finally {
    setLoading(false);
  }

  // 加载完再判断 version 是否跳过锁
  const version = (cleanSettings.version || '').toLowerCase();
  const skipLock = version.includes('dev');

  if (skipLock) {
    console.log('是dev版本绕过程序锁');
    return;
  } else {
    console.log('不是dev版本，执行程序锁');
  }

  // 正常走锁检查
  let isUnlocked = false;
  try {
    isUnlocked = await invoke('check_ftp_lock');
  } catch (err) {
    console.error('FTP 锁检查失败:', err);
  }

  if (isUnlocked) {
    return;
  }

  // 锁未通过 → 密码输入
  const password = prompt('程序已锁定，请输入密码（明文）：');

  if (!password) {
    alert('未输入密码，程序退出');
    await invoke('exit_app');
    return;
  }

  const correct = await invoke('verify_password', { password });

  if (correct) {
    alert('密码正确，解锁成功！');
    return;
  } else {
    alert('密码错误，程序退出');
    await invoke('exit_app');
    return;
  }
	};

	bootstrap();

	return () => {
    if (handleKeyDown) {
      window.removeEventListener("keydown", handleKeyDown);
    }
  };
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
      console.log('点击开始抽奖 - 重新读取 settings.json...');
      const rawSettings = await loadSettings();
      const cleanSettings = Object.fromEntries(
        Object.entries(rawSettings).filter(([k]) => !k.startsWith('//'))
      );
      setSettings(cleanSettings);
      setPred1stId(cleanSettings['1st-prize-pred'] || '');
      setPredGrandId(cleanSettings['grand-prize-pred'] || '');

      const csvText = await loadParticipantsCsv();
      const readMax = Number(cleanSettings.read_fields_max ?? 4);
      const data = parseParticipantsCSVFromString(csvText, readMax);
      if (data.length === 0) throw new Error('名单中没有有效参与者');

      setParticipants(data);
      console.log(`重新读取完成，有效人数: ${data.length}`);

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
      const readMax = Number(cleanSettings.read_fields_max ?? 4);
      const data = parseParticipantsCSVFromString(csvText, readMax);

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

	const scheme = settings.scheme || 'classic-red';  // 如果 settings 里没写，默认 classic-red

  const displayText = Array(settings.display_fields || 2)
    .fill('')
    .map((_, i) => Object.values(currentPerson)[i] || '')
    .filter(Boolean)
    .join('　');

  if (loading) return <div className="main-screen">加载中...</div>;

  if (!isFullscreen) {
    return (
      <div className="main-screen">
        <h2>抽奖系统</h2>
        
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
              let resourcesPath = '获取失败，请检查打包配置';

              try {
                const appData = await appLocalDataDir();
                const base = appData.replace(/[\/\\]$/, '');
                outputPath = `${base}\\output`;

                const exeDir = await invoke('get_exe_dir');
                const resBase = exeDir.replace(/[\/\\]$/, '');
                resourcesPath = `${resBase}\\resources\\configuration`;
              } catch (err) {
                console.error('路径获取失败:', err);
                outputPath = `错误：${err.message || '未知错误'}`;
                resourcesPath = `错误：${err.message || '未知错误'}`;
              }

							 // ★ 新增这一行：设置版本文本（如果 settings.version 存在就用，否则空）
    const vText = settings.version ? ` ${settings.version}` : '';
    setVersionText(vText);

              setOutputPath(outputPath);
              setResourcesPath(resourcesPath);
              setShowAbout(true);
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

        {/* 关于弹窗 */}
        {showAbout && (
          <div 
            className="modal-overlay"
            onClick={() => setShowAbout(false)}
          >
            <div 
              className="modal-content"
              onClick={e => e.stopPropagation()}
            >
              <h3>抽奖桌面程序{versionText} (内部版)</h3>
              <p>作者：yangzibox@163.com</p>
              <p>GitHub: https://github.com/yangzibox/work</p>

              {/* ==================== 配置目录（configuration） ==================== */}
							<div className="path-section">
								<p>配置目录（configuration 文件夹）：</p>
								
								<div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
									<div 
										className="path-box"
										onDoubleClick={(e) => {
											const range = document.createRange();
											range.selectNodeContents(e.currentTarget);
											window.getSelection().removeAllRanges();
											window.getSelection().addRange(range);
										}}
										style={{ flex: 1 }}
									>
										{resourcesPath || '正在获取路径...'}
									</div>

									{/* 浅灰色 + 点击效果按钮 */}
									<button 
										onClick={() => {
											if (resourcesPath) {
												openSystemFolder(resourcesPath);
											} else {
												alert('配置文件路径尚未加载，请稍后再试');
											}
										}}
										disabled={!resourcesPath}
										style={{
											padding: '6px 14px',
											backgroundColor: '#8b949e',        // 更浅的灰色
											color: 'white',
											border: 'none',
											borderRadius: '4px',
											cursor: resourcesPath ? 'pointer' : 'not-allowed',
											fontSize: '13px',
											whiteSpace: 'nowrap',
											height: '32px',
											display: 'flex',
											alignItems: 'center',
											gap: '5px',
											transition: 'all 0.2s ease',
											boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
										}}
										onMouseDown={(e) => {
											if (resourcesPath) {
												e.currentTarget.style.transform = 'scale(0.95)';
												e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)';
											}
										}}
										onMouseUp={(e) => {
											e.currentTarget.style.transform = 'scale(1)';
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.transform = 'scale(1)';
										}}
									>
										📂 打开
									</button>
								</div>
							</div>

              {/* ==================== 输出目录（output） ==================== */}
							<div className="path-section">
								<p>中奖结果保存路径（output）：</p>
								
								<div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
									<div 
										className="path-box"
										onDoubleClick={(e) => {
											const range = document.createRange();
											range.selectNodeContents(e.currentTarget);
											window.getSelection().removeAllRanges();
											window.getSelection().addRange(range);
										}}
										style={{ flex: 1 }}
									>
										{outputPath}
									</div>

									{/* 浅灰色 + 点击效果按钮 */}
									<button 
										onClick={() => openSystemFolder(outputPath)}
										style={{
											padding: '6px 14px',
											backgroundColor: '#8b949e',        // 更浅的灰色
											color: 'white',
											border: 'none',
											borderRadius: '4px',
											cursor: 'pointer',
											fontSize: '13px',
											whiteSpace: 'nowrap',
											height: '32px',
											display: 'flex',
											alignItems: 'center',
											gap: '5px',
											transition: 'all 0.2s ease',
											boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
										}}
										onMouseDown={(e) => {
											e.currentTarget.style.transform = 'scale(0.95)';
											e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)';
										}}
										onMouseUp={(e) => {
											e.currentTarget.style.transform = 'scale(1)';
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.transform = 'scale(1)';
										}}
									>
										📂 打开
									</button>
								</div>
							</div>

              <div style={{ marginTop: '20px', textAlign: 'left', fontSize: '14px', color: '#444' }}>
                <p style={{ fontWeight: 'bold' }}>操作步骤：</p>
                <p>修改 configuration 文件夹里的 settings.json 或 participants.csv 并保存。</p>
                <p>返回程序主界面。</p>
                <p>点击右上角“↻ 刷新配置”按钮。</p>
                <p>程序会立即重新读取文件，更新奖项和人数，弹窗提示“配置刷新成功！”和当前人数。</p>

                <p style={{ fontWeight: 'bold', marginTop: '16px' }}>注意事项：</p>
                <p>修改后没变化？检查文件是否保存成功、路径是否正确、编码是否UTF-8。</p>
                <p>全屏抽奖中途改配置文件不会即时生效，先按 Esc 中断抽奖，再点刷新配置。</p>
								<p>全屏抽奖中途按 Esc 会中断抽奖过程，请提前实验好配置，避免正式抽奖意外废止！</p>
								<p>作者灵活就业中。</p>
								<p>2026年3月</p>
              </div>

              <button 
                onClick={() => setShowAbout(false)}
                className="close-btn"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }


  if (screen === 'finish') {
    return (
      <div className={`fullscreen scheme-${scheme} bg-anim-active`}>
        <h1 className="finish-title">抽奖结束</h1>
        <p className="tips">感谢参与 • Esc 退出全屏</p>
      </div>
    );
  }

  if (screen === 'result') {
    return (
      <div className={`fullscreen result-screen bg-anim-active scheme-${scheme}`}>
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

        <p className="tips">空格键 → 继续下一轮　　Esc → 中断抽奖</p>
      </div>
    );
  }


  return (

		<div className={`fullscreen ${isFullscreen ? 'bg-anim-active' : ''} scheme-${scheme}`}>
      {screen === 'prize_guide' ? (
        <>
          <h1 className="guide-title">
            下面抽取 <span className="prize-name">{currentPrize.name}</span>
          </h1>
          <h2 className="guide-count">名额 {currentPrize.total} 人</h2>
          <p className="tips">空格键开始滚动　　Esc 中断抽奖</p>
        </>
      ) : (
        <>
          <h1 className={screen === 'rolling' ? 'rolling-text' : ''}>
            {displayText || '准备中...'}
          </h1>
          <p className="tips">空格键停止滚动　　Esc 中断抽奖</p>
        </>
      )}
    </div>
  );
}

export default App;