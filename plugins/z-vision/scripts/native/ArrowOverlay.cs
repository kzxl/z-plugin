using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ZVision.Native
{
    public static class ArrowOverlay
    {
        private sealed class ArrowSlot
        {
            public int Id;
            public int X;
            public int Y;
            public string Label;
            public DateTime ExpiresUtc;
        }

        private static readonly object SlotLock = new object();
        private static readonly Dictionary<int, ArrowSlot> Slots = new Dictionary<int, ArrowSlot>();
        private static readonly Color[] Palette = new Color[]
        {
            Color.FromArgb(0, 190, 255),   // #1 cyan
            Color.FromArgb(16, 210, 130),  // #2 emerald
            Color.FromArgb(250, 180, 20),  // #3 amber
            Color.FromArgb(170, 110, 255), // #4 violet
            Color.FromArgb(255, 95, 130),  // #5 rose
            Color.FromArgb(65, 150, 255),  // #6 sky
            Color.FromArgb(145, 220, 45),  // #7 lime
            Color.FromArgb(255, 135, 50)   // #8 orange
        };

        private static Thread _uiThread;
        private static OverlayForm _form;
        private static volatile bool _started = false;

        public static void ShowArrow(int id, int screenX, int screenY, string label, int ttlMs)
        {
            try
            {
                EnsureStarted();
                lock (SlotLock)
                {
                    ArrowSlot s;
                    if (!Slots.TryGetValue(id, out s))
                    {
                        s = new ArrowSlot();
                        s.Id = id;
                        Slots[id] = s;
                    }
                    s.X = screenX;
                    s.Y = screenY;
                    s.Label = string.IsNullOrEmpty(label) ? ("#" + id) : label;
                    s.ExpiresUtc = DateTime.UtcNow.AddMilliseconds(Math.Max(250, ttlMs));
                }
            }
            catch { }
        }

        public static void ClearArrow(int id)
        {
            lock (SlotLock)
            {
                Slots.Remove(id);
            }
        }

        public static void ClearAll()
        {
            lock (SlotLock)
            {
                Slots.Clear();
            }
        }

        private static void EnsureStarted()
        {
            if (_started) return;
            lock (SlotLock)
            {
                if (_started) return;
                _started = true;
                _uiThread = new Thread(delegate()
                {
                    try
                    {
                        _form = new OverlayForm();
                        Application.Run(_form);
                    }
                    catch { }
                });
                _uiThread.IsBackground = true;
                _uiThread.SetApartmentState(ApartmentState.STA);
                _uiThread.Name = "ZVisionArrowOverlay";
                _uiThread.Start();
            }
        }

        private sealed class OverlayForm : Form
        {
            private readonly System.Windows.Forms.Timer _timer;
            private readonly Font _font = new Font("Segoe UI", 8.5f, FontStyle.Bold);

            public OverlayForm()
            {
                FormBorderStyle = FormBorderStyle.None;
                ShowInTaskbar = false;
                TopMost = true;
                StartPosition = FormStartPosition.Manual;
                DoubleBuffered = true;
                BackColor = Color.Magenta;
                TransparencyKey = Color.Magenta;
                Bounds = SystemInformation.VirtualScreen;

                _timer = new System.Windows.Forms.Timer();
                _timer.Interval = 33;
                _timer.Tick += OnTick;
                _timer.Start();
            }

            protected override bool ShowWithoutActivation
            {
                get { return true; }
            }

            protected override CreateParams CreateParams
            {
                get
                {
                    CreateParams cp = base.CreateParams;
                    cp.ExStyle |= 0x00000020; // WS_EX_TRANSPARENT (click-through)
                    cp.ExStyle |= 0x00080000; // WS_EX_LAYERED
                    cp.ExStyle |= 0x00000080; // WS_EX_TOOLWINDOW
                    cp.ExStyle |= 0x08000000; // WS_EX_NOACTIVATE
                    cp.ExStyle |= 0x00000008; // WS_EX_TOPMOST
                    return cp;
                }
            }

            private void OnTick(object sender, EventArgs e)
            {
                int activeCount = 0;
                DateTime now = DateTime.UtcNow;
                lock (SlotLock)
                {
                    List<int> expired = new List<int>();
                    foreach (KeyValuePair<int, ArrowSlot> kv in Slots)
                    {
                        if (kv.Value.ExpiresUtc <= now) expired.Add(kv.Key);
                    }
                    for (int i = 0; i < expired.Count; i++) Slots.Remove(expired[i]);
                    activeCount = Slots.Count;
                }

                if (activeCount == 0)
                {
                    if (Visible) Hide();
                    return;
                }

                Rectangle vs = SystemInformation.VirtualScreen;
                if (Bounds != vs) Bounds = vs;
                if (!Visible)
                {
                    ShowWindow(Handle, 8); // SW_SHOWNA
                }
                Invalidate();
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                base.OnPaint(e);
                List<ArrowSlot> snapshot = new List<ArrowSlot>();
                lock (SlotLock)
                {
                    foreach (ArrowSlot s in Slots.Values)
                    {
                        ArrowSlot copy = new ArrowSlot();
                        copy.Id = s.Id;
                        copy.X = s.X;
                        copy.Y = s.Y;
                        copy.Label = s.Label;
                        snapshot.Add(copy);
                    }
                }
                if (snapshot.Count == 0) return;

                Graphics g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle vs = SystemInformation.VirtualScreen;

                for (int i = 0; i < snapshot.Count; i++)
                {
                    ArrowSlot s = snapshot[i];
                    int lx = s.X - vs.Left;
                    int ly = s.Y - vs.Top;
                    Color fill = Palette[Math.Abs(s.Id - 1) % Palette.Length];

                    Point[] poly = new Point[]
                    {
                        new Point(lx, ly),
                        new Point(lx + 15, ly + 11),
                        new Point(lx + 8, ly + 12),
                        new Point(lx + 12, ly + 21),
                        new Point(lx + 8, ly + 23),
                        new Point(lx + 4, ly + 14),
                        new Point(lx, ly + 19)
                    };

                    using (SolidBrush sb = new SolidBrush(fill))
                    using (Pen outline = new Pen(Color.FromArgb(20, 24, 32), 1.6f))
                    {
                        g.FillPolygon(sb, poly);
                        g.DrawPolygon(outline, poly);
                    }

                    SizeF ts = g.MeasureString(s.Label, _font);
                    Rectangle pill = new Rectangle(lx + 16, ly + 12, (int)Math.Ceiling(ts.Width) + 6, (int)Math.Ceiling(ts.Height) + 2);
                    using (SolidBrush bg = new SolidBrush(Color.FromArgb(24, 28, 36)))
                    using (Pen border = new Pen(fill, 1f))
                    using (SolidBrush txtBrush = new SolidBrush(Color.White))
                    {
                        g.FillRectangle(bg, pill);
                        g.DrawRectangle(border, pill);
                        g.DrawString(s.Label, _font, txtBrush, pill.X + 3, pill.Y + 1);
                    }
                }
            }
        }

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    }
}
