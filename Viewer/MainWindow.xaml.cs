using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;

namespace Viewer
{
    public partial class MainWindow : Window
    {

        private readonly SonarRenderer _renderer = new();
        private readonly SonarPlayer _player = new();
        private readonly DispatcherTimer _renderTimer;
        private readonly DispatcherTimer _fpsTimer;

        private string? _currentFolder;
        private List<SonarFileMeta> _fileMetas = [];
        private List<SonarFrame>? _frames;
        private int _currentFrameIndex = 0;


        private static readonly double[] RangeSteps = { 2.0, 4.0, 8.0, 20.0, 24.0 };
        private int _rangeIndex = 1;

        private bool _isUserSeeking = false;
        private bool _suppressSliderEvent = false;

        private int _framesSinceLastFpsTick = 0;
        private DateTime _lastFpsTick = DateTime.UtcNow;


        public MainWindow()
        {
            InitializeComponent();

            SonarImage.Source = _renderer.Bitmap;

            _renderer.DisplayRange = RangeSteps[_rangeIndex];
            _renderer.MaxRange = 24.0;
            UpdateRangeLabel();
            BakeGrid();

            // Render timer — 30ms tick
            _renderTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(30) };
            _renderTimer.Tick += OnRenderTick;
            _renderTimer.Start();

            // FPS timer — mỗi giây
            _fpsTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _fpsTimer.Tick += OnFpsTick;
            _fpsTimer.Start();

            // Player events
            _player.FrameReady += OnFrameReady;
            _player.PlaybackFinished += OnPlaybackFinished;
            _player.ProgressChanged += OnProgressChanged;

            SetStatus("Chọn thư mục để bắt đầu.");
        }

        private void OnBrowseFolderClick(object sender, RoutedEventArgs e)
        {
            // Dùng FolderBrowserDialog qua WPF OpenFileDialog hack
            var dlg = new Microsoft.Win32.OpenFileDialog
            {
                Title = "Chọn thư mục chứa file sonar — chọn bất kỳ file nào trong thư mục",
                Filter = "Sonar files (*.sonar)|*.sonar|All files (*.*)|*.*",
                CheckFileExists = false,
                FileName = "Chọn thư mục này"
            };

            if (dlg.ShowDialog(this) != true) return;

            string folder = Path.GetDirectoryName(dlg.FileName)!;
            LoadFolder(folder);
        }

        private void OnRefreshClick(object sender, RoutedEventArgs e)
        {
            if (_currentFolder != null)
                LoadFolder(_currentFolder);
        }

        private void LoadFolder(string folder)
        {
            _currentFolder = folder;
            FolderLabel.Text = ShortenPath(folder, 30);

            var files = Directory.GetFiles(folder, "*.sonar", SearchOption.TopDirectoryOnly)
                                 .OrderByDescending(f => f)
                                 .ToList();

            if (files.Count == 0)
            {
                FileListBox.ItemsSource = null;
                SetStatus($"Không tìm thấy file .sonar trong: {folder}");
                return;
            }

            // Đọc metadata nền
            _fileMetas = [];
            FileListBox.ItemsSource = null;

            Task.Run(() =>
            {
                var metas = new List<SonarFileMeta>();
                foreach (var f in files)
                {
                    try { metas.Add(SonarFileReader.ReadMeta(f)); }
                    catch { /* skip file lỗi */ }
                }
                return metas;
            })
            .ContinueWith(t =>
            {
                _fileMetas = t.Result;
                FileListBox.ItemsSource = _fileMetas;
                SetStatus($"Tìm thấy {_fileMetas.Count} file.");
            }, TaskScheduler.FromCurrentSynchronizationContext());
        }

        private void OnFileSelected(object sender, SelectionChangedEventArgs e)
        {
            if (FileListBox.SelectedItem is not SonarFileMeta meta) return;
            LoadSonarFile(meta.FilePath);
        }

        private void LoadSonarFile(string filePath)
        {
            _player.Stop();
            _renderer.Clear();
            _frames = null;
            UpdateControlState();
            EmptyOverlay.Visibility = Visibility.Visible;
            SetStatus($"Đang đọc: {Path.GetFileName(filePath)} …");

            Task.Run(() => SonarFileReader.ReadAllFrames(filePath))
                .ContinueWith(t =>
                {
                    if (t.IsFaulted)
                    {
                        MessageBox.Show($"Lỗi đọc file:\n{t.Exception?.InnerException?.Message}",
                            "Lỗi", MessageBoxButton.OK, MessageBoxImage.Error);
                        SetStatus("Lỗi đọc file.");
                        return;
                    }

                    var frames = t.Result;
                    if (frames.Count == 0)
                    {
                        MessageBox.Show("File không có dữ liệu.",
                            "Thông báo", MessageBoxButton.OK, MessageBoxImage.Warning);
                        SetStatus("File rỗng.");
                        return;
                    }

                    _frames = frames;
                    _renderer.MaxRange = EstimateMaxRange(frames);

                    // Update UI
                    long durMs = frames[^1].TimestampMs - frames[0].TimestampMs;
                    var dur = TimeSpan.FromMilliseconds(durMs);

                    NowPlayingLabel.Text = Path.GetFileName(filePath);
                    FrameCountLabel.Text = $"{frames.Count:N0} frames";
                    TotalDurationLabel.Text = dur.ToString(@"mm\:ss");
                    EndTimeLabel.Text = dur.ToString(@"mm\:ss");
                    CurrentTimeLabel.Text = "00:00";
                    FrameIndexLabel.Text = "0";

                    _suppressSliderEvent = true;
                    ProgressSlider.Maximum = frames.Count - 1;
                    ProgressSlider.Value = 0;
                    _suppressSliderEvent = false;

                    EmptyOverlay.Visibility = Visibility.Collapsed;
                    UpdateControlState(hasFile: true);
                    SetStatus($"Sẵn sàng — {frames.Count:N0} frames, {dur:mm\\:ss}");

                }, TaskScheduler.FromCurrentSynchronizationContext());
        }


        private void OnPlayPauseClick(object sender, RoutedEventArgs e)
        {
            if (_frames == null) return;

            if (_player.IsPlaying)
            {
                _player.Pause();
                IconPlayPause.Text = "\uE768"; // Play icon
                LabelPlayPause.Text = "Play";
                SetStatus("Tạm dừng.");
            }
            else if (_player.IsPaused)
            {
                _player.Resume();
                IconPlayPause.Text = "\uE769"; // Pause icon
                LabelPlayPause.Text = "Pause";
                SetStatus("Đang phát…");
            }
            else
            {
                StartPlayback();
            }
        }

        private void OnStopClick(object sender, RoutedEventArgs e)
        {
            _player.Stop();
            _renderer.Clear();
            _currentFrameIndex = 0;

            _suppressSliderEvent = true;
            ProgressSlider.Value = 0;
            _suppressSliderEvent = false;

            CurrentTimeLabel.Text = "00:00";
            FrameIndexLabel.Text = "0";
            IconPlayPause.Text = "\uE768"; // Play icon
            LabelPlayPause.Text = "Play";
            SetStatus("Đã dừng.");
        }

        private void OnStepBack(object sender, RoutedEventArgs e)
        {
            if (_frames == null) return;
            int target = Math.Max(0, _currentFrameIndex - 50);
            SeekTo(target);
        }

        private void OnStepForward(object sender, RoutedEventArgs e)
        {
            if (_frames == null) return;
            int target = Math.Min(_frames.Count - 1, _currentFrameIndex + 50);
            SeekTo(target);
        }

        private void StartPlayback()
        {
            if (_frames == null) return;

            _renderer.Clear();
            _player.PlaybackSpeed = GetSpeed();
            _player.Play(_frames, loop: LoopCheckBox.IsChecked == true);
            IconPlayPause.Text = "\uE769"; // Pause icon
            LabelPlayPause.Text = "Pause";
            SetStatus("Đang phát…");
        }

        private void SeekTo(int frameIndex)
        {
            if (_frames == null) return;
            frameIndex = Math.Clamp(frameIndex, 0, _frames.Count - 1);

            _player.SeekToFrame(frameIndex);
            _renderer.SeekRebuild(_frames.Take(frameIndex + 1));
            _currentFrameIndex = frameIndex;

            UpdateTimeLabels(frameIndex);

            _suppressSliderEvent = true;
            ProgressSlider.Value = frameIndex;
            _suppressSliderEvent = false;
        }



        private void OnFrameReady(SonarFrame frame)
        {
            _renderer.Feed(frame);
            Interlocked.Increment(ref _framesSinceLastFpsTick);
        }

        private void OnPlaybackFinished()
        {
            Dispatcher.BeginInvoke(() =>
            {
                IconPlayPause.Text = "\uE768"; // Play icon
                LabelPlayPause.Text = "Play";
                SetStatus("Phát xong.");
            });
        }

        private void OnProgressChanged(int frameIndex, int totalFrames)
        {
            if (_isUserSeeking) return;

            Dispatcher.BeginInvoke(() =>
            {
                _currentFrameIndex = frameIndex;
                UpdateTimeLabels(frameIndex);

                _suppressSliderEvent = true;
                ProgressSlider.Value = frameIndex;
                _suppressSliderEvent = false;
            });
        }

        private void OnSliderMouseDown(object sender, MouseButtonEventArgs e)
        {
            _isUserSeeking = true;
            if (_player.IsPlaying) _player.Pause();
        }

        private void OnSliderMouseUp(object sender, MouseButtonEventArgs e)
        {
            if (_frames == null) { _isUserSeeking = false; return; }

            int target = (int)ProgressSlider.Value;
            SeekTo(target);
            _isUserSeeking = false;

            if (_player.IsPaused) _player.Resume();
        }

        private void OnProgressSliderChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
        {
            if (_suppressSliderEvent || _frames == null) return;
            int idx = (int)ProgressSlider.Value;
            UpdateTimeLabels(idx);
        }

        private void OnRenderTick(object? sender, EventArgs e)
        {
            _renderer.Tick();
        }

        private void OnFpsTick(object? sender, EventArgs e)
        {
            int count = Interlocked.Exchange(ref _framesSinceLastFpsTick, 0);
            FpsLabel.Text = $"{count}";
        }


        private void OnIncreaseRange(object sender, RoutedEventArgs e)
        {
            if (_rangeIndex >= RangeSteps.Length - 1) return;
            _rangeIndex++;
            ApplyRange();
        }

        private void OnDecreaseRange(object sender, RoutedEventArgs e)
        {
            if (_rangeIndex <= 0) return;
            _rangeIndex--;
            ApplyRange();
        }

        private void ApplyRange()
        {
            _renderer.DisplayRange = RangeSteps[_rangeIndex];
            UpdateRangeLabel();
            BakeGrid();
            _renderer.Redraw();
        }

        private void UpdateRangeLabel()
        {
            RangeLabel.Text = $"{RangeSteps[_rangeIndex]:0.0} m";
        }

        // Color 

        private void OnColorChanged(object sender, SelectionChangedEventArgs e)
        {
            _renderer.ColorMode = ColorCombo.SelectedIndex switch
            {
                1 => SonarColorMode.GreenRadar,
                2 => SonarColorMode.White,
                3 => SonarColorMode.Yellow,
                _ => SonarColorMode.Heatmap
            };
            _renderer.Redraw();
        }

        // Speed

        private void OnSpeedChanged(object sender, SelectionChangedEventArgs e)
        {
            _player.PlaybackSpeed = GetSpeed();
        }

        private double GetSpeed() => SpeedCombo.SelectedIndex switch
        {
            0 => 0.25,
            1 => 1.0,
            2 => 2.0,
            3 => 4.0,
            4 => 8.0,
            _ => 1.0
        };

        // Grid 

        private void BakeGrid()
        {
            GridCanvas.Children.Clear();

            double range = RangeSteps[_rangeIndex];
            double cx = SonarRenderer.ImgSize / 2.0;
            double cy = SonarRenderer.ImgSize / 2.0;
            double maxR = SonarRenderer.ImgSize / 2.0 - 2;

            // Vòng tròn
            for (int c = 1; c <= 4; c++)
            {
                double radius = maxR * c / 4.0;

                var ellipse = new System.Windows.Shapes.Ellipse
                {
                    Width = radius * 2,
                    Height = radius * 2,
                    Stroke = new SolidColorBrush(Color.FromRgb(50, 80, 50)),
                    StrokeThickness = 1,
                    Fill = Brushes.Transparent
                };
                Canvas.SetLeft(ellipse, cx - radius);
                Canvas.SetTop(ellipse, cy - radius);
                GridCanvas.Children.Add(ellipse);

                var label = new TextBlock
                {
                    Text = $"{range * c / 4.0:0.0}m",
                    Foreground = new SolidColorBrush(Color.FromRgb(60, 100, 60)),
                    FontFamily = new FontFamily("Consolas"),
                    FontSize = 10
                };
                Canvas.SetLeft(label, cx + 3);
                Canvas.SetTop(label, cy - radius + 2);
                GridCanvas.Children.Add(label);
            }

            // Đường spoke (12 hướng)
            for (int i = 0; i < 12; i++)
            {
                double angle = 2 * Math.PI * i / 12;
                var line = new System.Windows.Shapes.Line
                {
                    X1 = cx,
                    Y1 = cy,
                    X2 = cx + maxR * Math.Cos(angle),
                    Y2 = cy - maxR * Math.Sin(angle),
                    Stroke = new SolidColorBrush(Color.FromRgb(30, 50, 30)),
                    StrokeThickness = 1
                };
                GridCanvas.Children.Add(line);
            }

            // Tâm
            var center = new System.Windows.Shapes.Ellipse
            {
                Width = 6,
                Height = 6,
                Fill = new SolidColorBrush(Color.FromRgb(0, 200, 80))
            };
            Canvas.SetLeft(center, cx - 3);
            Canvas.SetTop(center, cy - 3);
            GridCanvas.Children.Add(center);
        }

        // Helpers

        private void UpdateTimeLabels(int frameIndex)
        {
            if (_frames == null || frameIndex >= _frames.Count) return;

            long elapsed = _frames[frameIndex].TimestampMs - _frames[0].TimestampMs;
            CurrentTimeLabel.Text = TimeSpan.FromMilliseconds(elapsed).ToString(@"mm\:ss");
            FrameIndexLabel.Text = frameIndex.ToString("N0");
        }

        private void UpdateControlState(bool hasFile = false)
        {
            BtnPlayPause.IsEnabled = hasFile;
            BtnStop.IsEnabled = hasFile;
            BtnStepBack.IsEnabled = hasFile;
            BtnStepForward.IsEnabled = hasFile;
            ProgressSlider.IsEnabled = hasFile;

            IconPlayPause.Text = "\uE768";
            LabelPlayPause.Text = "Play";
        }

        private void SetStatus(string msg) => StatusLabel.Text = msg;

        private static double EstimateMaxRange(List<SonarFrame> frames)
        {
            // Lấy sample count của frame đầu tiên có data
            foreach (var f in frames)
                if (f.Data.Length > 0)
                    return f.Data.Length / 1200.0 * 50.0;
            return 50.0;
        }

        private static string ShortenPath(string path, int maxLen)
        {
            if (path.Length <= maxLen) return path;
            return "…" + path[^(maxLen - 1)..];
        }

        protected override void OnClosed(EventArgs e)
        {
            _player.Stop();
            _renderTimer.Stop();
            _fpsTimer.Stop();
            _player.Dispose();
            base.OnClosed(e);
        }
    }
}
