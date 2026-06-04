using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Viewer
{
    public enum SonarColorMode { Heatmap, GreenRadar, White, Yellow }

    public sealed class SonarRenderer
    {
        public const int ImgSize = 512;

        public WriteableBitmap Bitmap { get; }

        public SonarColorMode ColorMode { get; set; } = SonarColorMode.Heatmap;
        public double MaxRange { get; set; } = 24.0;  // mét, range thực tế của hardware
        public double DisplayRange { get; set; } = 4.0; // mét, range hiển thị

        // ── Internal ──────────────────────────────────────────────────────────
        private readonly byte[] _sonarLayer;
        private readonly byte[]?[] _spokes = new byte[]?[400];
        private readonly int _stride;
        private readonly double _cx, _cy, _maxR;

        private readonly ConcurrentDictionary<int, byte[]> _incomingBuffer = new();
        private int _latestGrad = -1;
        private int _lastGrad = -1;

        public SonarRenderer()
        {
            _stride = ImgSize * 4;
            _sonarLayer = new byte[ImgSize * _stride];

            Bitmap = new WriteableBitmap(
                ImgSize, ImgSize, 96, 96, PixelFormats.Bgra32, null);

            _cx = ImgSize / 2.0;
            _cy = ImgSize / 2.0;
            _maxR = ImgSize / 2.0 - 2;
        }

        public void Feed(SonarFrame frame)
        {
            int grad = frame.AngleGrads % 400;
            _incomingBuffer[grad] = frame.Data;
            _latestGrad = grad;
        }

        public void Tick()
        {
            int hardwareGrad = _latestGrad;
            if (hardwareGrad < 0) { Flush(); return; }
            if (_lastGrad < 0) _lastGrad = hardwareGrad;

            int grad = _lastGrad;

            while (true)
            {
                if (_incomingBuffer.TryRemove(grad, out var data))
                    _spokes[grad] = data;

                ClearSpoke(grad);
                if (_spokes[grad] != null)
                    DrawSpoke(grad, _spokes[grad]!);

                if (grad == hardwareGrad) break;
                grad = (grad + 1) % 400;
            }

            _lastGrad = (hardwareGrad + 1) % 400;
            Flush();
        }

        public void Clear()
        {
            _incomingBuffer.Clear();
            Array.Clear(_spokes, 0, _spokes.Length);
            Array.Clear(_sonarLayer, 0, _sonarLayer.Length);
            _latestGrad = -1;
            _lastGrad = -1;
            Flush();
        }

        public void Redraw()
        {
            Array.Clear(_sonarLayer, 0, _sonarLayer.Length);
            for (int g = 0; g < 400; g++)
            {
                if (_spokes[g] != null)
                    DrawSpoke(g, _spokes[g]!);
            }
            Flush();
        }

        private void ClearSpoke(int gradIndex)
        {
            double theta = GradToTheta(gradIndex);
            double cosT = Math.Cos(theta);
            double sinT = Math.Sin(theta);
            double nx = -sinT;
            double ny = cosT;

            for (double r = 0; r <= _maxR; r += 0.8)
            {
                double bx = _cx + r * cosT;
                double by = _cy + r * sinT;

                for (int w = -1; w <= 1; w++)
                {
                    int px = (int)(bx + nx * w);
                    int py = (int)(by + ny * w);
                    if ((uint)px >= ImgSize || (uint)py >= ImgSize) continue;

                    int idx = py * _stride + px * 4;
                    _sonarLayer[idx] = 0;
                    _sonarLayer[idx + 1] = 0;
                    _sonarLayer[idx + 2] = 0;
                    _sonarLayer[idx + 3] = 0;
                }
            }
        }

        private void DrawSpoke(int gradIndex, byte[] data)
        {
            if (data.Length == 0) return;

            double theta = GradToTheta(gradIndex);
            double cosT = Math.Cos(theta);
            double sinT = Math.Sin(theta);
            double nx = -sinT;
            double ny = cosT;
            double metersPerSample = MaxRange / data.Length;
            double displayRange = DisplayRange;

            for (int i = 0; i < data.Length; i++)
            {
                byte raw = data[i];
                if (raw == 0) continue;

                double dist = i * metersPerSample;
                if (dist > displayRange) break;

                double r = dist / displayRange * _maxR;
                double baseX = _cx + r * cosT;
                double baseY = _cy + r * sinT;

                ColorFromIntensity(raw, out byte nr, out byte ng, out byte nb);

                for (int w = -1; w <= 1; w++)
                {
                    int px = (int)(baseX + nx * w);
                    int py = (int)(baseY + ny * w);
                    if ((uint)px >= ImgSize || (uint)py >= ImgSize) continue;

                    int idx = py * _stride + px * 4;
                    double weight = w == 0 ? 1.0 : 0.5;

                    byte wb = (byte)(nb * weight);
                    byte wg = (byte)(ng * weight);
                    byte wr = (byte)(nr * weight);

                    if (wb > _sonarLayer[idx]) _sonarLayer[idx] = wb;
                    if (wg > _sonarLayer[idx + 1]) _sonarLayer[idx + 1] = wg;
                    if (wr > _sonarLayer[idx + 2]) _sonarLayer[idx + 2] = wr;
                    _sonarLayer[idx + 3] = 255;
                }
            }
        }


        private void Flush()
        {
            Bitmap.Lock();
            unsafe
            {
                byte* dst = (byte*)Bitmap.BackBuffer;
                fixed (byte* src = _sonarLayer)
                {
                    Buffer.MemoryCopy(src, dst, ImgSize * _stride, ImgSize * _stride);
                }
            }
            Bitmap.AddDirtyRect(new Int32Rect(0, 0, ImgSize, ImgSize));
            Bitmap.Unlock();
        }

        private void ColorFromIntensity(byte v, out byte r, out byte g, out byte b)
        {
            switch (ColorMode)
            {
                case SonarColorMode.White:
                    r = g = b = v; return;

                case SonarColorMode.Yellow:
                    r = v; g = v; b = (byte)(v * 0.2f); return;

                case SonarColorMode.GreenRadar:
                    r = 0; g = v; b = 0; return;

                default:
                    HeatmapColor(v, out r, out g, out b); return;
            }
        }

        public void SeekRebuild(IEnumerable<SonarFrame> framesUpToSeek)
        {
            // Reset hoàn toàn
            _incomingBuffer.Clear();
            Array.Clear(_spokes, 0, _spokes.Length);
            _latestGrad = -1;
            _lastGrad = -1;

            // Nạp lại tất cả spoke từ đầu đến vị trí seek
            // Frame sau ghi đè frame trước nếu cùng góc
            foreach (var frame in framesUpToSeek)
            {
                int grad = frame.AngleGrads % 400;
                _spokes[grad] = frame.Data;
            }

            // Vẽ lại toàn bộ
            Redraw();
        }

        private static void HeatmapColor(byte intensity, out byte r, out byte g, out byte b)
        {
            double t = intensity / 255.0;
            if (t < 0.25)
            {
                r = 0; g = 0;
                b = (byte)(t / 0.25 * 180);
            }
            else if (t < 0.5)
            {
                r = 0;
                g = (byte)((t - 0.25) / 0.25 * 255);
                b = (byte)(180 - (t - 0.25) / 0.25 * 180);
            }
            else if (t < 0.75)
            {
                r = (byte)((t - 0.5) / 0.25 * 255);
                g = 255; b = 0;
            }
            else
            {
                r = 255;
                g = (byte)((1.0 - t) / 0.25 * 255);
                b = 0;
            }
        }

        private static double GradToTheta(int grad) =>
            grad / 400.0 * 2.0 * Math.PI + Math.PI / 2.0;
    }
}
