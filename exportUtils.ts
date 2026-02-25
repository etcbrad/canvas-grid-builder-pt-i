// Simple export utilities for canvas content

export interface ExportOptions {
  format: 'png' | 'jpeg' | 'webp';
  quality?: number; // 0..1 for jpeg/webp
  filename?: string;
}

export interface VideoExportOptions {
  duration?: number; // seconds
  fps?: number;
  format: 'webm' | 'mp4';
  quality?: number; // 0..1
  filename?: string;
}

export const exportCanvasAsImage = (
  canvas: HTMLCanvasElement,
  options: ExportOptions = { format: 'png' }
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const { format = 'png', quality = 0.9, filename } = options;
      
      // Generate filename if not provided
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const finalFilename = filename || `canvas-export-${timestamp}.${format}`;
      
      // Convert canvas to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to generate image blob'));
            return;
          }
          
          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = finalFilename;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Cleanup
          setTimeout(() => URL.revokeObjectURL(url), 100);
          resolve();
        },
        format === 'jpeg' ? 'image/jpeg' : `image/${format}`,
        format === 'png' ? undefined : quality
      );
    } catch (error) {
      reject(error);
    }
  });
};

export const exportCanvasAsVideo = async (
  canvas: HTMLCanvasElement,
  renderFrame: () => void,
  options: VideoExportOptions
): Promise<void> => {
  const { duration = 3, fps = 30, format = 'webm', quality = 0.8, filename } = options;
  
  return new Promise((resolve, reject) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const finalFilename = filename || `canvas-export-${timestamp}.${format}`;
      
      // Check for MediaRecorder support
      const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Fallback to webm if mp4 is not supported
        const fallbackMimeType = 'video/webm';
        if (!MediaRecorder.isTypeSupported(fallbackMimeType)) {
          reject(new Error('Video recording is not supported in this browser'));
          return;
        }
        // Retry with webm
        exportCanvasAsVideo(canvas, renderFrame, { ...options, format: 'webm' as const })
          .then(resolve)
          .catch(reject);
        return;
      }
      
      const stream = canvas.captureStream(fps);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      });
      
      const chunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Cleanup
        setTimeout(() => URL.revokeObjectURL(url), 100);
        resolve();
      };
      
      mediaRecorder.onerror = (event) => {
        reject(new Error(`MediaRecorder error: ${event}`));
      };
      
      // Start recording
      mediaRecorder.start(100); // 100ms chunks
      
      // Render frames for the specified duration
      const totalFrames = Math.ceil(duration * fps);
      let currentFrame = 0;
      
      const renderNextFrame = () => {
        if (currentFrame >= totalFrames) {
          mediaRecorder.stop();
          return;
        }
        
        renderFrame();
        currentFrame++;
        setTimeout(renderNextFrame, 1000 / fps);
      };
      
      renderNextFrame();
      
    } catch (error) {
      reject(error);
    }
  });
};

export const captureCurrentFrame = (
  canvas: HTMLCanvasElement,
  options: ExportOptions = { format: 'png' }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const { format = 'png', quality = 0.9 } = options;
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to capture frame'));
            return;
          }
          
          const url = URL.createObjectURL(blob);
          resolve(url);
        },
        format === 'jpeg' ? 'image/jpeg' : `image/${format}`,
        format === 'png' ? undefined : quality
      );
    } catch (error) {
      reject(error);
    }
  });
};
