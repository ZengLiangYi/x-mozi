class RecorderProcessor extends AudioWorkletProcessor {
  // AudioWorkletProcessor 的 process 方法有固定签名，未使用的参数用下划线前缀
  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // 发送音频数据到主线程
      this.port.postMessage(channelData);
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
