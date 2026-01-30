import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WAV2LIP_BASE_URL = process.env.WAV2LIP_BASE_URL || 'http://localhost:8000';

/**
 * 上传 TTS 音频到 Wav2Lip 后端
 * POST /api/lipsync/upload-audio
 * 
 * 接收：FormData { file: File }
 * 返回：{ file_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: '请使用 multipart/form-data 上传音频文件' },
        { status: 400 }
      );
    }
    
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: '请提供音频文件' },
        { status: 400 }
      );
    }
    
    // 转换为 ArrayBuffer 再创建新的 Blob，确保数据完整
    const arrayBuffer = await file.arrayBuffer();
    const fileBlob = new Blob([arrayBuffer], { type: file.type || 'audio/mp3' });
    const fileName = file instanceof File ? file.name : 'audio.mp3';
    
    console.log(`接收到音频: ${fileName}, 大小: ${fileBlob.size} bytes, 类型: ${fileBlob.type}`);
    
    // 创建新的 FormData 转发到 Wav2Lip 后端
    const forwardFormData = new FormData();
    forwardFormData.append('file', fileBlob, fileName);
    
    // 转发到 Wav2Lip 后端
    const response = await fetch(`${WAV2LIP_BASE_URL}/api/upload/audio`, {
      method: 'POST',
      body: forwardFormData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Wav2Lip upload-audio 失败:', errorText);
      return NextResponse.json(
        { error: 'Wav2Lip 上传失败', details: errorText },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log('Wav2Lip 音频上传成功:', data);
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('upload-audio 路由错误:', error);
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: '上传音频失败', details: message },
      { status: 500 }
    );
  }
}
