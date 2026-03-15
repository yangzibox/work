import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isFullscreen) return

      if (e.key === ' ') {
        e.preventDefault()
        setIsActive(prev => !prev)
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        // 尝试退出全屏
        if (document.exitFullscreen) {
          document.exitFullscreen()
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen()
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen()
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    // 监听全屏变化事件，同步状态
    const handleFullscreenChange = () => {
      const fullscreenElement = 
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement

      const isFull = !!fullscreenElement
      setIsFullscreen(isFull)

      // 如果退出全屏，重置闪烁状态
      if (!isFull) {
        setIsActive(false)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    }
  }, [isFullscreen])

  const enterFullscreen = () => {
    const elem = document.documentElement
    if (elem.requestFullscreen) {
      elem.requestFullscreen()
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen()
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen()
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen()
    }
  }

  if (!isFullscreen) {
    return (
      <div className="main-screen">
        <button className="start-button" onClick={enterFullscreen}>
          开始抽奖
        </button>
        <p className="hint">点击按钮进入全屏抽奖模式</p>
      </div>
    )
  }

  return (
    <div className="fullscreen">
      <h1 className={isActive ? 'blink' : ''}>
        下一个幸运儿：测试
      </h1>

      <div className="tips">
        空格键：{isActive ? '暂停闪烁' : '开始闪烁'}　　Esc：退出全屏
      </div>
    </div>
  )
}

export default App