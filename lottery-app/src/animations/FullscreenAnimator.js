// src/animations/FullscreenAnimator.js
import { useRef, useState, useCallback, useEffect } from 'react';
import confetti from 'canvas-confetti';

export function useFullscreenAnimator({
  participants = [],
  onIndexChange = () => {},
  onComplete = () => {},        // 改名，更清晰：动画完全结束
  baseInterval = 50,            // 初始最快速度（越小越快）
  slowdownStartAfter = 4000,    // 滚动多久后开始减速（ms）
  slowdownDuration = 2800,      // 减速阶段时长
  finalSlowSteps = 8,           // 最后故意慢下来的格子数
  shakeDuration = 1400,         // 最终晃动阶段
  onShakeStart = () => {},      // 可选：晃动开始时的回调（可加重音效）
}) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle → rolling → slowing → finalSlow → shaking → stopped
  const [currentIndex, setCurrentIndex] = useState(0);

  const rafRef = useRef(null);
  const startTimeRef = useRef(0);
  const lastTickRef = useRef(0);
  const targetIndexRef = useRef(-1);   // 用于内定/预测

  const totalParticipants = participants.length;

  const getNextInterval = useCallback((elapsed) => {
    if (phase === 'rolling') {
      if (elapsed >= slowdownStartAfter) {
        setPhase('slowing');
      }
      return baseInterval;
    }

    if (phase === 'slowing') {
      const progress = Math.min(1, (elapsed - slowdownStartAfter) / slowdownDuration);
      // ease-out quad
      const eased = 1 - (1 - progress) ** 4;
      return baseInterval + (600 - baseInterval) * eased;
    }

    if (phase === 'finalSlow') {
      return 220 + Math.random() * 180; // 220~400ms 随机感
    }

    if (phase === 'shaking') {
      return 280 + Math.sin(elapsed / 120) * 140; // 140~420ms 晃动
    }

    return 100;
  }, [phase, baseInterval, slowdownStartAfter, slowdownDuration]);

  const tick = useCallback(() => {
    const now = performance.now();
    const elapsedTotal = now - startTimeRef.current;

    if (now - lastTickRef.current >= getNextInterval(elapsedTotal)) {
      lastTickRef.current = now;

      if (phase === 'finalSlow' || phase === 'shaking') {
        // 最后阶段允许不连续跳动，制造“找不着北”的感觉
        setCurrentIndex(prev => (prev + (Math.random() > 0.4 ? 1 : 2)) % totalParticipants);
      } else {
        setCurrentIndex(prev => (prev + 1) % totalParticipants);
      }

      onIndexChange(currentIndex);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [phase, totalParticipants, onIndexChange, currentIndex, getNextInterval]);

  const start = useCallback((initialIndex = 0) => {
    if (isAnimating || totalParticipants <= 1) return;

    setIsAnimating(true);
    setPhase('rolling');
    setCurrentIndex(initialIndex);
    targetIndexRef.current = -1;

    startTimeRef.current = performance.now();
    lastTickRef.current = startTimeRef.current;

    rafRef.current = requestAnimationFrame(tick);

    // 可选：未来在这里播放背景滚动音效
  }, [isAnimating, totalParticipants, tick]);

  const stop = useCallback((forcedTargetIndex = -1) => {
    if (!isAnimating) return;

    targetIndexRef.current = forcedTargetIndex >= 0 
      ? forcedTargetIndex 
      : currentIndex;

    setPhase('slowing');

    // 减速结束后进入最后几格慢动作
    setTimeout(() => {
      setPhase('finalSlow');

      // 最后慢动作结束后开始晃动
      setTimeout(() => {
        setPhase('shaking');
        onShakeStart?.();

        // 晃动结束后强制停到目标位置
        setTimeout(() => {
          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }

          setCurrentIndex(targetIndexRef.current);
          onIndexChange(targetIndexRef.current);

          setPhase('stopped');
          setIsAnimating(false);

          // 庆祝
          confetti({
            particleCount: 220,
            spread: 100,
            origin: { y: 0.55 },
            colors: ['#ffeb3b', '#ffffff', '#ff4d4f', '#ffd700'],
          });

          onComplete(targetIndexRef.current);
        }, shakeDuration);
      }, finalSlowSteps * 320); // 粗略估计最后慢动作时间
    }, slowdownDuration);
  }, [
    isAnimating,
    currentIndex,
    onIndexChange,
    onComplete,
    slowdownDuration,
    shakeDuration,
    finalSlowSteps,
    onShakeStart,
  ]);

  const forceStop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsAnimating(false);
    setPhase('stopped');
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    isAnimating,
    phase,
    currentIndex,        // 现在是 state，可直接用于渲染
    start,
    stop,               // stop(目标索引) → 支持内定
    forceStop,
  };
}