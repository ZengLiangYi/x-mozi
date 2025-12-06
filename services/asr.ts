export async function speechToText(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.mp3');

  const response = await fetch('/api/asr', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('ASR API failed');
  }

  const data = await response.json();
  return data.text;
}

