import { useState, useEffect } from 'react';
import { View, Text, Button, Map } from '@tarojs/components';
import Taro, { useLoad, useDidShow, useDidHide } from '@tarojs/taro';

export default function Index() {
  const [location, setLocation] = useState(null);
  const [markers, setMarkers] = useState([]);

  // 页面加载
  useLoad(() => {
    console.log('首页加载了');
    startRealTimeLocation();
  });

  useDidShow(() => {
    startRealTimeLocation();
  });

  useDidHide(() => {
    stopRealTimeLocation();
  });

  // 启动实时定位
  const startRealTimeLocation = () => {
    Taro.startLocationUpdate({
      success: () => console.log('✅ 实时定位启动成功'),
      fail: (err) => {
        console.error('启动实时定位失败', err);
        Taro.showToast({ title: '定位启动失败', icon: 'none' });
      }
    });

    // 监听位置变化（人移动就会触发）
    Taro.onLocationChange((res) => {
      console.log('📍 位置更新：', res.latitude, res.longitude);
      setLocation(res);
    });
  };

  // 停止实时定位
  const stopRealTimeLocation = () => {
    Taro.stopLocationUpdate();
    Taro.offLocationChange();
  };

  // 点击打卡
  const handleCheckIn = () => {
    if (!location?.latitude || !location?.longitude) {
      Taro.showToast({ title: '定位尚未就绪', icon: 'none' });
      return;
    }

    const newMarker = {
      id: Date.now(),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      width: 40,
      height: 40,
      callout: {
        content: `已打卡\n${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`,
        display: 'ALWAYS',
        bgColor: '#ffffff',
        padding: 10,
        borderRadius: 8,
        fontSize: 13
      }
    };

    setMarkers(prev => [...prev, newMarker]);
    
    Taro.showToast({ title: '打卡成功！', icon: 'success' });
  };

  return (
    <View className='index' style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <View style={{ flex: 1 }}>
        {location ? (
          <Map
            key={markers.length}
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

      {/* 底部打卡栏 */}
      <View style={{
        height: '80px',
        background: '#fff',
        borderTop: '1px solid #ddd',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: '20px',
        boxShadow: '0 -3px 10px rgba(0,0,0,0.1)'
      }}>
        <Button
          onClick={handleCheckIn}
          type='primary'
          style={{
            width: '90%',
            height: '52px',
            lineHeight: '52px',
            borderRadius: '50px',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
        >
          📍 打卡签到
        </Button>
      </View>
    </View>
  );
}