import { useState } from 'react';
import { View, Text, Button, Map, ScrollView } from '@tarojs/components';
import Taro, { useLoad, useDidShow, useDidHide } from '@tarojs/taro';

export default function Index() {
  const [location, setLocation] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [openid, setOpenid] = useState('');           // 保存用户openid
  const [historyData, setHistoryData] = useState([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // 初始化云开发并获取 openid
  const initCloudAndGetOpenid = async () => {
    try {
      Taro.cloud.init({
        env: 'cloud1-9gmmxhmtcc18ab22'     // ← 这里改成你自己的云环境ID
      });

      const res = await Taro.cloud.callFunction({
        name: 'login'           // 需要创建一个 login 云函数 
      });

      const userOpenid = res.result.openid;
      setOpenid(userOpenid);
      console.log('获取openid成功:', userOpenid);
    } catch (err) {
      console.error('获取openid失败', err);
      Taro.showToast({ title: '获取用户标识失败', icon: 'none' });
    }
  };

  useLoad(() => {
    console.log('首页加载了');
    initCloudAndGetOpenid();     // 页面加载时获取 openid
    startRealTimeLocation();
  });

  useDidShow(() => {
    startRealTimeLocation();
  });

  useDidHide(() => {
    stopRealTimeLocation();
  });

  const startRealTimeLocation = () => {
    Taro.startLocationUpdate({
      type: 'gcj02',           // 添加：坐标系类型
      isHighAccuracy: true,    // 添加：启用高精度定位
      highAccuracyExpireTime: 5000,  // 添加：高精度超时时间
      success: () => console.log('✅ 实时定位启动成功'),
      fail: (err) => console.error('启动失败', err)
    });

    Taro.onLocationChange((res) => {
      console.log('📍 微信返回的完整位置数据:', JSON.stringify(res, null, 2));
      if (res.latitude && res.longitude) setLocation(res);
    });
  };

  const stopRealTimeLocation = () => {
    Taro.stopLocationUpdate();
    Taro.offLocationChange();
  };

  // 打卡历史
  const showHistory = async () => {
    try {
      if (!openid) {
        Taro.showToast({ title: '用户信息未获取', icon: 'none' });
        return;
      }

      Taro.showLoading({ title: '加载中...' });

      const result = await Taro.cloud.callFunction({
        name: 'getMyCheckins',
        data: { openid: openid }
      });

      Taro.hideLoading();

      if (result.result?.code === 200) {
        const data = result.result.data;

        //data.reverse();  //反转正序，倒序排列

        const formattedData = data.map(item => ({
          id: item._id || item.timestamp,
          // 只显示服务器时间，如果没有就显示"时间未知"
          timeStr: item.serverTime
            ? new Date(item.serverTime).toLocaleString('zh-CN')
            : '时间未知',
          address: item.address || '未知地址',
          latitude: item.latitude,
          longitude: item.longitude,
          coordinate: `${item.latitude?.toFixed(6) || '0.000000'}, ${item.longitude?.toFixed(6) || '0.000000'}`
        }));

        setHistoryData(formattedData);
        setShowHistoryPanel(true);
      } else {
        Taro.showToast({ title: '查询失败', icon: 'none' });
      }
    } catch (err) {
      Taro.hideLoading();
      console.error('查询失败:', err);
      Taro.showToast({ title: '查询出错', icon: 'none' });
    }
  };

  // 点击打卡
  const handleCheckIn = async () => {
    if (!location?.latitude || !location?.longitude) {
      Taro.showToast({ title: '定位尚未就绪', icon: 'none' });
      return;
    }

    const timestamp = Date.now();

    // 显示更友好的标识（openid 后8位）
    const shortId = openid ? openid.slice(-8) : '未知用户';

    const newMarker = {
      id: timestamp,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      width: 40,
      height: 40,
      callout: {
        content: `用户${shortId}\n${timestamp}\n${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`,
        display: 'ALWAYS',
        bgColor: '#ffffff',
        padding: 10,
        borderRadius: 8,
        fontSize: 13
      }
    };

    setMarkers(prev => [...prev, newMarker]);
    Taro.showToast({ title: '打卡成功！', icon: 'success' });
    // 新增：调用云函数保存数据
    try {
      const saveResult = await Taro.cloud.callFunction({
        name: 'saveCheckin',
        data: {
          openid: openid || 'unknown', // 直接传，即使为空
          timestamp: timestamp, // 秒级时间戳
          latitude: Number(location.latitude),
          longitude: Number(location.longitude)
        }
      });
      console.log('云函数保存结果:', saveResult);
    } catch (err) {
      console.error('调用云函数失败:', err);
    }
  };

  return (
    <View className='index' style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <View style={{ flex: 1 }}>
        {location ? (
          <Map
            latitude={location.latitude}
            longitude={location.longitude}
            scale={17}
            style={{ width: '100%', height: '100%' }}
            showLocation={true}
            markers={markers}
          />
        ) : (
          <View style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f8' }}>
            <Text>正在启动实时定位...</Text>
          </View>
        )}
      </View>

      <View style={{
        height: '80px',
        background: '#fff',
        borderTop: '1px solid #ddd',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: '20px',
        boxShadow: '0 -3px 10px rgba(0,0,0,0.1)',
        gap: '10px' // 新增：给两个按钮添加间距
      }}>
        {/* 原来的打卡签到按钮（现在在左边） */}
        <Button
          onClick={handleCheckIn}
          type='primary'
          style={{
            width: '45%', // 修改：从 90% 改为 45%
            height: '52px',
            lineHeight: '52px',
            borderRadius: '50px',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
        >
          📍 打卡签到
        </Button>

        {/* 新增的打卡历史按钮（在右边） */}
        <Button
          onClick={showHistory} // 改为调用 showHistory 函数
          style={{
            width: '45%', // 新增按钮宽度
            height: '52px',
            lineHeight: '52px',
            borderRadius: '50px',
            fontSize: '16px',
            fontWeight: 'bold',
            background: '#f0f0f0', // 灰色背景
            color: '#333' // 黑色文字
          }}
        >
          📚 打卡历史
        </Button>
      </View>

      {showHistoryPanel && (
        <View style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000
        }}>
          {/* 1. 顶部：打卡历史标题 - 确保居中 */}
          <View style={{
            height: 60,
            backgroundColor: 'white',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: '#f0f0f0'
          }}>
            <Text style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: '#333',
              textAlign: 'center',
              lineHeight: 60
            }}>
              打卡历史
            </Text>
          </View>

          {/* 2. 中间：历史记录列表 */}
          <ScrollView
            style={{
              height: 'calc(100vh - 140px)',
              backgroundColor: 'white'
            }}
            scrollY
            scrollWithAnimation
            enableBackToTop
          >
            {historyData.map((item, index) => (
              <View
                key={item.id || index}
                style={{
                  padding: 15,
                  margin: '10px 15px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: 10,
                  borderLeftWidth: 4,
                  borderLeftColor: '#07c160'
                }}
              >
                <Text style={{
                  fontSize: 16,  // 加粗
                  fontWeight: 'bold',  // 加粗
                  color: '#333',
                  marginBottom: 6
                }}>
                  {item.timeStr}
                </Text>

                <View style={{ height: 4 }} /> {/* 增加间距 */}

                <Text style={{
                  fontSize: 16,
                  fontWeight: '500',
                  color: '#333',
                  marginBottom: 6,
                  lineHeight: 1.4
                }}>
                  📍 {item.address}
                </Text>

                <View style={{ height: 4 }} /> {/* 增加间距 */}

                <Text style={{
                  fontSize: 12,
                  color: '#999',
                  fontFamily: 'monospace'
                }}>
                  ({item.coordinate})
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* 3. 底部：返回按钮区域 - 确保居中 */}
          <View
            style={{
              height: 80,
              backgroundColor: 'white',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              borderTopWidth: 1,
              borderTopColor: '#f0f0f0'
            }}
            onClick={() => setShowHistoryPanel(false)}
          >
            {/* 返回按钮 - 确保居中 */}
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                width: 120,
                height: 40,
                backgroundColor: '#07c160',
                borderRadius: 20
              }}
            >
              <Text style={{
                fontSize: 16,
                fontWeight: '500',
                color: 'white',
                textAlign: 'center',
                lineHeight: 40
              }}>
                返回
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}