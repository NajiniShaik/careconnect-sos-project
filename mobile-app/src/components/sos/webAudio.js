// webAudio.js
let mediaRecorder = null;
let audioChunks = [];
let webAudioPlayer = null;

export async function startWebRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start();
    return { success: true, stream };
  } catch (error) {
    console.error("Web Mic Error:", error);
    return { success: false, error: "Microphone permission denied in browser." };
  }
}

export function stopWebRecording(stream) {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      resolve(null);
      return;
    }

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const audioUrl = URL.createObjectURL(audioBlob);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      resolve(audioUrl);
    };

    mediaRecorder.stop();
  });
}

export function playWebAudio(url, onEndedCallback) {
  if (webAudioPlayer) {
    if (!webAudioPlayer.paused) {
      webAudioPlayer.pause();
      return false; // is paused
    }
  }

  webAudioPlayer = new Audio(url);
  webAudioPlayer.onended = () => {
    if (onEndedCallback) onEndedCallback();
  };
  webAudioPlayer.play();
  return true; // is playing
}

export function deleteWebAudio() {
  if (webAudioPlayer) {
    webAudioPlayer.pause();
    webAudioPlayer = null;
  }
}