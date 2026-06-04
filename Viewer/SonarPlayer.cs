using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace Viewer
{
    public sealed class SonarPlayer : IDisposable
    {
        public event Action<SonarFrame>? FrameReady;

        public event Action? PlaybackFinished;

        public event Action<int, int>? ProgressChanged;

        // State 
        public bool IsPlaying => _state == PlayerState.Playing;
        public bool IsPaused => _state == PlayerState.Paused;

        private double _playbackSpeed = 1.0;
        public double PlaybackSpeed
        {
            get => _playbackSpeed;
            set
            {
                var clamped = Math.Clamp(value, 0.1, 16.0);
                if (Math.Abs(clamped - _playbackSpeed) > 1e-9)
                {
                    _playbackSpeed = clamped;
                    _speedChanged = true; // <-- signal cho loop
                }
            }
        }

        // Internal
        private enum PlayerState { Idle, Playing, Paused, Stopped }
        private volatile PlayerState _state = PlayerState.Idle;

        private CancellationTokenSource? _cts;
        private Task? _task;
        private readonly SemaphoreSlim _pauseSemaphore = new(0, 1);

        private List<SonarFrame> _frames = [];
        private int _seekTarget = -1;

        private bool _disposed;


        private volatile bool _speedChanged = false;
        /// Bắt đầu phát. Gọi lại sẽ restart từ đầu.</summary>
        public void Play(List<SonarFrame> frames, bool loop = false)
        {
            if (frames.Count == 0)
                throw new ArgumentException("Danh sách frame rỗng.", nameof(frames));

            StopInternal(waitForTask: true);

            _frames = frames;
            _seekTarget = -1;
            _state = PlayerState.Playing;
            _cts = new CancellationTokenSource();
            _task = Task.Run(() => PlayLoopAsync(loop, _cts.Token));
        }

        /// Tạm dừng. Có thể Resume() sau.
        public void Pause()
        {
            if (_state != PlayerState.Playing) return;
            _state = PlayerState.Paused;
        }

        /// Tiếp tục sau Pause.
        public void Resume()
        {
            if (_state != PlayerState.Paused) return;
            _state = PlayerState.Playing;

            // Nếu loop đang chờ semaphore, release nó
            if (_pauseSemaphore.CurrentCount == 0)
                _pauseSemaphore.Release();
        }

        /// Toggle Pause/Resume.
        public void TogglePause()
        {
            if (_state == PlayerState.Playing) Pause();
            else if (_state == PlayerState.Paused) Resume();
        }

        /// Dừng và reset. Không fire PlaybackFinished.
        public void Stop() => StopInternal(waitForTask: false);

        /// Seek đến frame index. Có hiệu lực ở frame tiếp theo.
        /// Hoạt động cả khi đang Playing lẫn Paused.
        public void SeekToFrame(int frameIndex)
        {
            if (_frames.Count == 0) return;
            _seekTarget = Math.Clamp(frameIndex, 0, _frames.Count - 1);

            // Nếu đang pause, resume tạm để loop nhận seek rồi tự pause lại
            if (_state == PlayerState.Paused)
            {
                _state = PlayerState.Playing;
                if (_pauseSemaphore.CurrentCount == 0)
                    _pauseSemaphore.Release();
            }
        }

        public void Dispose()
        {
            if (_disposed) return;
            StopInternal(waitForTask: true);
            _pauseSemaphore.Dispose();
            _disposed = true;
            GC.SuppressFinalize(this);
        }

        // Core loop
        private async Task PlayLoopAsync(bool loop, CancellationToken ct)
        {
            int startIndex = 0;

            do
            {
                var sw = Stopwatch.StartNew();
                long playbackBaseMs = 0;
                int i = startIndex;
                startIndex = 0; // chỉ dùng startIndex cho lần đầu

                while (i < _frames.Count && !ct.IsCancellationRequested)
                {
                    // Xử lý seek 
                    int seekTo = Interlocked.Exchange(ref _seekTarget, -1);

                    if (seekTo >= 0)
                    {
                        i = seekTo;

                        playbackBaseMs =
                            (long)((_frames[i].TimestampMs - _frames[0].TimestampMs)
                                   / PlaybackSpeed);

                        sw.Restart();

                        continue;
                    }
                    // Xử lý pause 
                    while (_state == PlayerState.Paused && !ct.IsCancellationRequested)
                    {
                        try { await _pauseSemaphore.WaitAsync(100, ct); }
                        catch (OperationCanceledException) { return; }
                    }

                    if (ct.IsCancellationRequested) return;

                    var frame = _frames[i];

                    if (_speedChanged)
                    {
                        _speedChanged = false;
                        playbackBaseMs = (long)((frame.TimestampMs - _frames[0].TimestampMs) / PlaybackSpeed);
                        sw.Restart();
                    }

                    // Timing 
                    if (i > 0)
                    {
                        long expectedMs = (long)((frame.TimestampMs - _frames[0].TimestampMs) / PlaybackSpeed);

                        long elapsedMs =
                            playbackBaseMs + sw.ElapsedMilliseconds;

                        long waitMs =
                            expectedMs - elapsedMs;

                        if (waitMs > 0 && waitMs < 5_000)
                        {
                            try { await Task.Delay((int)waitMs, ct); }
                            catch (OperationCanceledException) { return; }
                        }
                    }

                    // Fire 
                    FrameReady?.Invoke(frame);
                    ProgressChanged?.Invoke(i, _frames.Count);

                    i++;
                }

            } while (loop && !ct.IsCancellationRequested);

            if (!ct.IsCancellationRequested)
            {
                _state = PlayerState.Idle;
                PlaybackFinished?.Invoke();
            }
        }

        private void StopInternal(bool waitForTask)
        {
            _state = PlayerState.Stopped;
            _cts?.Cancel();

            // Release semaphore nếu loop đang block ở pause
            try { _pauseSemaphore.Release(); } catch { /* đã full */ }

            if (waitForTask && _task != null)
            {
                try { _task.Wait(TimeSpan.FromSeconds(2)); }
                catch { /* ignore AggregateException từ cancel */ }
            }

            _cts?.Dispose();
            _cts = null;
            _task = null;
            _state = PlayerState.Idle;

            // Drain semaphore về 0
            while (_pauseSemaphore.CurrentCount > 0)
                _pauseSemaphore.Wait(0);
        }
    }
}
