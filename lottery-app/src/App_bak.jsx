import { useState, useEffect } from 'react';
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

  const [pred1stId, setPred1stId] = useState('');
  const [predGrandId, setPredGrandId] = useState('');

  const isTauri = !!window.__TAURI__;

  // 通用 CSV 解析函数（支持无表头 + #注释 + 前4列固定含义）
  const parseParticipantsCSV = async (csvPath, readMax) => {
    const csvRes = await fetch(`/${csvPath}?t=${Date.now()}`, { cache: 'no-store' });
    if (!csvRes.ok) throw new Error(`participants.csv 加载失败 ${csvRes.status}`);

    const csvText = await csvRes.text();
    const lines = csvText.split(/\r?\n/);

    // 过滤空行和 # 开头的注释行（任何位置的 # 行都忽略）
    const filteredLines = lines
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    if (filteredLines.length < 1) throw new Error('CSV 文件没有有效数据');

    let headers = ['id', 'name', '职务', '部门'];  // 默认固定映射
    let dataStartIndex = 0;

    // 判断第一行是否像表头（包含常见关键词）
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
      dataStartIndex = 1;  // 从第二行开始是数据
    } else {
      // 无表头，第一行就是数据
      dataStartIndex = 0;
    }

    const data = filteredLines.slice(dataStartIndex).map(line => {
      const values = parseCSVLine(line);
      if (values.length < 2) return null;  // 至少要有 id 和姓名

      const row = {
        id: (values[0] || '').trim(),
        name: (values[1] || '').trim(),          // 固定第二列作为姓名
        职务: (values[2] || '').trim(),
        部门: (values[3] || '').trim(),
      };

      // 继续读额外列（如果 readMax > 4）
      for (let i = 4; i < Math.min(values.length, readMax); i++) {
        row[`col${i}`] = (values[i] || '').trim();
      }

      return row;
    }).filter(row => row && row.id && row.id.trim() !== '' && !row.id.startsWith('#'));

    if (data.length === 0) throw new Error('名单中没有有效参与者（缺少 id 或全部被过滤）');

    return data;
  };

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
        const readMax = Number(cleanSettings.read_fields_max || 4);
        const data = await parseParticipantsCSV(csvPath, readMax);

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
      setPred1stId(cleanSettings['1st-prize-pred'] || '');
      setPredGrandId(cleanSettings['grand-prize-pred'] || '');

      // 重新读取 participants.csv
      const csvPath = cleanSettings.participants || 'configuration/participants.csv';
      console.log('重新读取参与者名单:', csvPath);
      const readMax = Number(cleanSettings.read_fields_max || 4);
      const data = await parseParticipantsCSV(csvPath, readMax);

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

      // 如果校验通过，但 validPrizes 为空
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
	  // 新增：强制铺满视口（防浏览器默认不铺满）
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

      // 先过滤掉所有已中奖的
      let available = participants.filter(p => !usedIds.has(p.id));

      // 排除内定人员（让他们留到对应奖项）
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

      // 处理一等奖内定
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
      }

      // 处理特等奖内定
      else if (currentPrize.key === 'grand-prize' && predGrandId) {
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

      // 如果没有内定或内定无效，正常随机抽
      if (winners.length === 0) {
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        winners = shuffled.slice(0, currentPrize.total);
      }

      // 更新已中奖记录
      setUsedIds(prev => {
        const next = new Set(prev);
        winners.forEach(w => next.add(w.id));
        return next;
      });

      setCurrentRoundWinners(winners);
      setScreen('result');

      // 写入结果文件
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

  // 新增：严格校验奖项连续性规则
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

    // 火锅奖不参与连续起点判断
    const hotpotTotal = prizesWithTotal[hotpotIndex]?.total ?? 0;

    // 从六等奖开始查找第一个 >0 的奖项，作为连续起点
    let startIdx = -1;
    for (let i = hotpotIndex + 1; i <= firstPrizeIndex; i++) {
      if (prizesWithTotal[i].total > 0) {
        startIdx = i;
        break;
      }
    }

    if (startIdx !== -1) {
      // 从这个起点到一等奖，必须全部 > 0
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
      // 六等奖到一等奖全为 0
      if (hotpotTotal <= 0) {
        const grandTotal = prizesWithTotal.find(p => p.key === 'grand-prize')?.total ?? 0;
        if (grandTotal <= 0) {
          throw new Error('所有奖项数量均为 0，至少设置一个奖项！');
        }
      }
      // 火锅奖 >0 + 后面全 0 → 允许
    }

    const validPrizes = prizesWithTotal.filter(p => p.total > 0);
    return { validPrizes, prizesWithTotal };
  };

  // 新增：刷新配置按钮逻辑
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
      const readMax = Number(cleanSettings.read_fields_max || 4);
      const data = await parseParticipantsCSV(csvPath, readMax);

      // 严格校验奖项规则
      const { validPrizes: newValidPrizes } = validatePrizes(cleanSettings);

      // 更新状态
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
							console.log('成功获取路径：', outputPath);  // 加这行方便调试
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
      <div className="fullscreen result-screen">
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