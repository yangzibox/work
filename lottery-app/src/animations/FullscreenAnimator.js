// src/animations/FullscreenAnimator.js

import { useRef, useState, useCallback, useEffect } from 'react';
import confetti from 'canvas-confetti';  // npm install canvas-confetti

// 可选：音效（后面再加，先留注释）
/*
const rollSound = new Audio('/sounds/roll.mp3');
const winnerSound = new Audio('/sounds/winner.mp3');
*/

export function useFullscreenAnimator({
  participants = [],                // 参与者数组
  onIndexChange = () => {},         // 每帧更新 currentIndex 的回调
  onStop = () => {},                // 动画停止后回调（可用于计算中奖者）
  rollIntervalMs = 60,              // 初始滚动速度（ms/帧）
  slowDownDuration = 3000,          // 减速阶段持续时间
  shakeDuration = 1200,             // 最终晃动阶段时间
}) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle → rolling → slowing → shaking → stopped
  const currentIndexRef = useRef(0);
  const rafRef = useRef(null);
  const startTimeRef = useRef(0);
  const speedRef = useRef(rollIntervalMs);

  // 开始动画
  const start = useCallback(() => {
    if (isAnimating || participants.length === 0) return;

    setIsAnimating(true);
    setPhase('rolling');
    currentIndexRef.current = 0;
    startTimeRef.current = performance.now();

    // 可选：播放开始音效
    // rollSound.currentTime = 0;
    // rollSound.loop = true;
    // rollSound.play().catch(() => {});

    const animate = () => {
      const now = performance.now();
      const elapsed = now - startTimeRef.current;

      let nextInterval = speedRef.current;

      if (phase === 'slowing') {
        // 线性减速（可改成 ease-out）
        const progress = elapsed / slowDownDuration;
        nextInterval = rollIntervalMs + (400 - rollIntervalMs) * progress;
        nextInterval = Math.min(nextInterval, 400);
      } else if (phase === 'shaking') {
        // 晃动阶段：速度在 300~500ms 间抖动
        nextInterval = 300 + Math.sin(elapsed / 150) * 200;
      }

      if (now - startTimeRef.current >= nextInterval) {
        currentIndexRef.current = (currentIndexRef.current + 1) % participants.length;
        onIndexChange(currentIndexRef.current);
        startTimeRef.current = now; // 更新上次 tick 时间
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
  }, [participants.length, phase, onIndexChange]);

  // 停止动画（带减速 + 晃动）
  const stop = useCallback((targetIndex = -1) => {
    if (!isAnimating) return;

    setPhase('slowing');

    // 记录目标索引（如果有内定或预测）
    const finalTarget = targetIndex >= 0 ? targetIndex : currentIndexRef.current;

    setTimeout(() => {
      setPhase('shaking');

      // 晃动结束后强制停到目标位置
      setTimeout(() => {
        cancelAnimationFrame(rafRef.current);
        currentIndexRef.current = finalTarget;
        onIndexChange(finalTarget);

        setPhase('stopped');
        setIsAnimating(false);

        // 触发庆祝粒子
        confetti({
          particleCount: 180,
          spread: 90,
          origin: { y: 0.6 }
        });

        // 可选：播放中奖音效
        // rollSound.pause();
        // winnerSound.play().catch(() => {});

        onStop(finalTarget);
      }, shakeDuration);
    }, slowDownDuration);
  }, [isAnimating, onIndexChange, onStop]);

  // 立即强制停止（紧急情况）
  const forceStop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    setIsAnimating(false);
    setPhase('stopped');
    // rollSound.pause();
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // rollSound.pause();
    };
  }, []);

  return {
    isAnimating,
    phase,
    currentIndex: currentIndexRef.current,
    start,
    stop,
    forceStop,
  };
}