import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WAV2LIP_BASE_URL = process.env.WAV2LIP_BASE_URL || 'http://localhost:8000';

/**
 * 上传人脸全身照到 Wav2Lip 后端
 * POST /api/lipsync/upload-face
 * 
 * 接收：FormData { file: File } 或 { imageUrl: string }
 * 返回：{ file_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let fileBlob: Blob;
    let fileName: string = 'avatar.png';
    
    if (contentType.includes('multipart/form-data')) {
      // 接收文件上传
      const formData = await request.formData();
      const file = formData.get('file');
      
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { error: '请提供图片文件' },
          { status: 400 }
        );
      }
      
      // 转换为 ArrayBuffer 再创建新的 Blob，确保数据完整
      const arrayBuffer = await file.arrayBuffer();
      fileBlob = new Blob([arrayBuffer], { type: file.type || 'image/png' });
      fileName = file instanceof File ? file.name : 'avatar.png';
      
      console.log(`接收到文件: ${fileName}, 大小: ${fileBlob.size} bytes, 类型: ${fileBlob.type}`);
      
    } else if (contentType.includes('application/json')) {
      // 接收图片 URL，需要先下载
      const body = await request.json();
      const imageUrl = body.imageUrl;
      
      if (!imageUrl) {
        return NextResponse.json(
          { error: '请提供 imageUrl 或上传文件' },
          { status: 400 }
        );
      }
      
      // 下载图片
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return NextResponse.json(
          { error: `无法下载图片: ${imageResponse.status}` },
          { status: 400 }
        );
      }
      
      const arrayBuffer = await imageResponse.arrayBuffer();
      const contentTypeHeader = imageResponse.headers.get('content-type') || 'image/png';
      fileBlob = new Blob([arrayBuffer], { type: contentTypeHeader });
      
      console.log(`下载图片成功, 大小: ${fileBlob.size} bytes, 类型: ${fileBlob.type}`);
      
    } else {
      return NextResponse.json(
        { error: '不支持的 Content-Type' },
        { status: 400 }
      );
    }
    
    // 构建新的 FormData 转发到 Wav2Lip 后端
    const forwardFormData = new FormData();
    forwardFormData.append('file', fileBlob, fileName);
    
    console.log(`转发到 Wav2Lip: ${WAV2LIP_BASE_URL}/api/upload/face`);
    
    const response = await fetch(`${WAV2LIP_BASE_URL}/api/upload/face`, {
      method: 'POST',
      body: forwardFormData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Wav2Lip upload-face 失败:', errorText);
      return NextResponse.json(
        { error: 'Wav2Lip 上传失败', details: errorText },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log('Wav2Lip 上传成功:', data);
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('upload-face 路由错误:', error);
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: '上传人脸失败', details: message },
      { status: 500 }
    );
  }
}
