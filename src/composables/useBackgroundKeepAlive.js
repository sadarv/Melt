let audioContext = null;
let oscillator = null;
let gainNode = null;
let wakeLock = null;
let silentBuffer = null;
let silentSource = null;

export function startKeepAlive() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // ✅ 方案一：用极低音量的振荡器（音量 0.001，人耳几乎听不到）
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.setValueAtTime(0.001, audioContext.currentTime); // ✅ 不能为 0
    oscillator.frequency.setValueAtTime(40, audioContext.currentTime); // 极低频，更难察觉
    oscillator.start();

    // ✅ 方案二：同时循环播放一段静音 buffer（双保险，iOS 更认这种）
    const bufferSize = audioContext.sampleRate * 2; // 2秒
    silentBuffer = audioContext.createBuffer(
      1,
      bufferSize,
      audioContext.sampleRate,
    );
    // buffer 默认就是全零（静音），不需要填充
    function playLoop() {
      if (!audioContext) return;
      silentSource = audioContext.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(audioContext.destination);
      silentSource.onended = playLoop; // 循环
      silentSource.start();
    }
    playLoop();

    // ✅ 页面切换回来时恢复被系统暂停的 AudioContext
    document.addEventListener("visibilitychange", handleVisibilityChange);

    console.log("[保活] 后台音频保活已启动");
  } catch (e) {
    console.error("[保活] 音频启动失败:", e);
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible" && audioContext) {
    if (audioContext.state === "suspended") {
      audioContext.resume().then(() => {
        console.log("[保活] AudioContext 已恢复");
      });
    }
  }
}

export async function requestWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      console.log("[保活] 屏幕常亮已启动");
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible" && wakeLock === null) {
          try {
            wakeLock = await navigator.wakeLock.request("screen");
            console.log("[保活] 屏幕常亮已恢复");
          } catch {}
        }
      });
    } catch (e) {
      console.log("[保活] 屏幕常亮不可用:", e.message);
    }
  } else {
    console.log("[保活] 当前环境不支持 WakeLock（iOS Safari 不支持）");
  }
}

export function stopKeepAlive() {
  try {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (oscillator) {
      oscillator.stop();
      oscillator = null;
    }
    if (silentSource) {
      silentSource.onended = null;
      silentSource.stop();
      silentSource = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
    silentBuffer = null;
    console.log("[保活] 保活已停止");
  } catch {}
}

export function isKeepAliveActive() {
  return audioContext !== null && audioContext.state === "running";
}
