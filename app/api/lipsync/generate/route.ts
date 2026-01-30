import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WAV2LIP_BASE_URL = process.env.WAV2LIP_BASE_URL || 'http://localhost:8000';

/**
 * 流式生成对口型帧
 * POST /api/lipsync/generate
 * 
 * 接收：FormData { face_file_id: string, audio_file_id: string, ... }
 * 返回：SSE 流，包含帧数据
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const faceFileId = formData.get('face_file_id');
    const audioFileId = formData.get('audio_file_id');
    
    if (!faceFileId || !audioFileId) {
      return new Response(
        JSON.stringify({ error: '请提供 face_file_id 和 audio_file_id' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // 构建转发的 FormData
    const forwardFormData = new FormData();
    forwardFormData.append('face_file_id', faceFileId.toString());
    forwardFormData.append('audio_file_id', audioFileId.toString());
    
    // 可选参数
    const batchSize = formData.get('batch_size');
    const outputFps = formData.get('output_fps');
    const jpegQuality = formData.get('jpeg_quality');
    const resizeFactor = formData.get('resize_factor');
    
    if (batchSize) forwardFormData.append('batch_size', batchSize.toString());
    if (outputFps) forwardFormData.append('output_fps', outputFps.toString());
    if (jpegQuality) forwardFormData.append('jpeg_quality', jpegQuality.toString());
    if (resizeFactor) forwardFormData.append('resize_factor', resizeFactor.toString());
    
    // 转发到 Wav2Lip 后端
    const response = await fetch(`${WAV2LIP_BASE_URL}/api/generate/frames`, {
      method: 'POST',
      body: forwardFormData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Wav2Lip generate 失败:', errorText);
      return new Response(
        JSON.stringify({ error: 'Wav2Lip 生成失败', details: errorText }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    if (!response.body) {
      return new Response(
        JSON.stringify({ error: 'Wav2Lip 返回空响应' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // 直接转发 SSE 流
    const reader = response.body.getReader();
    
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }
            
            // 直接转发数据
            controller.enqueue(value);
          }
        } catch (error) {
          console.error('流式转发错误:', error);
          const errorMessage = error instanceof Error ? error.message : '流式转发失败';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`));
          controller.close();
        }
      },
      
      cancel() {
        reader.cancel();
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
    
  } catch (error) {
    console.error('generate 路由错误:', error);
    const message = error instanceof Error ? error.message : '未知错误';
    return new Response(
      JSON.stringify({ error: '生成失败', details: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
