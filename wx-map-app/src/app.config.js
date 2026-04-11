export default defineAppConfig({
  pages: [
    'pages/index/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'WeChat',
    navigationBarTextStyle: 'black'
  },
  // 新增这部分 ↓↓↓
  permission: {
    "scope.userLocation": {
      "desc": "你的位置信息将用于显示当前位置"
    }
  },
   requiredPrivateInfos: [
    "getLocation",
    "startLocationUpdate",     // ← 必须加
    "onLocationChange"         // ← 必须加
  ], 
})
