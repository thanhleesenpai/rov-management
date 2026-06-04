using System;
using System.Collections.Generic;
using System.IO;

namespace Viewer
{
    public sealed class SonarFrame
    {
        public long TimestampMs { get; init; }
        public ushort AngleGrads { get; init; }
        public byte[] Data { get; init; } = Array.Empty<byte>();
    }

    public sealed class SonarFileMeta
    {
        public string FilePath { get; init; } = "";
        public string FileName { get; init; } = "";
        public int FrameCount { get; init; }
        public long DurationMs { get; init; }
        public long FileSizeBytes { get; init; }

        public TimeSpan Duration => TimeSpan.FromMilliseconds(DurationMs);

        public string FileSizeDisplay => FileSizeBytes < 1_048_576
            ? $"{FileSizeBytes / 1024.0:0.0} KB"
            : $"{FileSizeBytes / 1_048_576.0:0.0} MB";

        public string DurationDisplay => Duration.ToString(@"mm\:ss");
    }

    /// <summary>
    /// Đọc file .sonar nhị phân.
    ///
    /// FORMAT:
    /// HEADER (32 bytes):
    ///   Magic    : "SONAR360" (8 bytes ASCII)
    ///   Version  : uint16
    ///   Reserved : 22 bytes
    /// FRAME (lặp lại):
    ///   Timestamp  : int64  (ms, tính từ lúc bắt đầu ghi)
    ///   AngleGrads : uint16 (0–399)
    ///   NumSamples : uint16
    ///   SampleData : byte[NumSamples]
    /// </summary>
    public static class SonarFileReader
    {
        private const string Magic = "SONAR360";

        public static List<SonarFrame> ReadAllFrames(string filePath)
        {
            using var fs = OpenRead(filePath);
            using var br = new BinaryReader(fs);

            ReadAndValidateHeader(br);

            var frames = new List<SonarFrame>();
            while (fs.Position < fs.Length)
                frames.Add(ReadFrame(br));

            return frames;
        }

        /// Đọc metadata nhanh, chỉ scan timestamp, không load data.
        public static SonarFileMeta ReadMeta(string filePath)
        {
            var fi = new FileInfo(filePath);

            using var fs = OpenRead(filePath);
            using var br = new BinaryReader(fs);

            ReadAndValidateHeader(br);

            long firstTs = 0, lastTs = 0;
            int frameCount = 0;

            while (fs.Position < fs.Length)
            {
                long ts = br.ReadInt64();
                _ = br.ReadUInt16();
                ushort count = br.ReadUInt16();
                fs.Seek(count, SeekOrigin.Current);

                if (frameCount == 0) firstTs = ts;
                lastTs = ts;
                frameCount++;
            }

            return new SonarFileMeta
            {
                FilePath = filePath,
                FileName = fi.Name,
                FrameCount = frameCount,
                DurationMs = frameCount > 1 ? lastTs - firstTs : 0,
                FileSizeBytes = fi.Length
            };
        }


        private static FileStream OpenRead(string path) =>
            new(path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536);

        private static void ReadAndValidateHeader(BinaryReader br)
        {
            var magic = System.Text.Encoding.ASCII.GetString(br.ReadBytes(8));
            if (magic != Magic)
                throw new InvalidDataException($"Không phải file sonar hợp lệ (magic sai: '{magic}').");

            ushort version = br.ReadUInt16();
            if (version != 1)
                throw new InvalidDataException($"Phiên bản file không được hỗ trợ: v{version}.");

            br.ReadBytes(22);
        }

        private static SonarFrame ReadFrame(BinaryReader br)
        {
            long ts = br.ReadInt64();
            ushort angle = br.ReadUInt16();
            ushort count = br.ReadUInt16();
            byte[] data = br.ReadBytes(count);

            return new SonarFrame
            {
                TimestampMs = ts,
                AngleGrads = angle,
                Data = data
            };
        }
    }
}
