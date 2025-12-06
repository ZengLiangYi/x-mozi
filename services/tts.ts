export async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error('TTS API failed');
  }

  const data = await response.json();
  
  if (!data.audio) {
    throw new Error('No audio data received');
  }

  // base64 to ArrayBuffer
  const binaryString = window.atob(data.audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

