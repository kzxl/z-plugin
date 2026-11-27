using System;
using System.Collections.Generic;

namespace ZVision.Native
{
    public static class GeometryPrimitives
    {
        public static List<List<int[]>> BuildShapeStrokes(string shape, List<int[]> points, int[] rect, bool fill, int segments, int fillSpacing)
        {
            string kind = string.IsNullOrEmpty(shape) ? "" : shape.ToLowerInvariant().Trim();
            List<List<int[]>> strokes = new List<List<int[]>>();
            int spacing = Math.Max(2, fillSpacing > 0 ? fillSpacing : 4);

            if (kind == "bezier")
            {
                if (points == null || points.Count < 3)
                    throw new ArgumentException("invalid_argument: bezier shape requires >= 3 control points");

                int segs = Math.Max(8, Math.Min(120, segments > 0 ? segments : 24));
                List<int[]> curve = new List<int[]>();
                curve.Add(new int[] { points[0][0], points[0][1] });

                int idx = 0;
                while (idx + 3 < points.Count)
                {
                    AppendCubic(curve, points[idx], points[idx + 1], points[idx + 2], points[idx + 3], segs);
                    idx += 3;
                }
                int remaining = points.Count - 1 - idx;
                if (remaining == 2)
                {
                    AppendQuadratic(curve, points[idx], points[idx + 1], points[idx + 2], segs);
                }
                else if (remaining == 1)
                {
                    curve.Add(new int[] { points[idx + 1][0], points[idx + 1][1] });
                }
                strokes.Add(curve);
                return strokes;
            }

            if (kind == "ellipse")
            {
                int rx, ry, rw, rh;
                ResolveBounds(rect, points, out rx, out ry, out rw, out rh);
                if (rw < 2 || rh < 2)
                    throw new ArgumentException("invalid_argument: ellipse requires rect or 2 points with width/height >= 2");

                int segs = Math.Max(12, Math.Min(120, segments > 0 ? segments : 36));
                double cx = rx + rw / 2.0;
                double cy = ry + rh / 2.0;
                double a = rw / 2.0;
                double b = rh / 2.0;

                List<int[]> outline = new List<int[]>();
                for (int k = 0; k <= segs; k++)
                {
                    double ang = (2.0 * Math.PI * k) / segs;
                    int x = (int)Math.Round(cx + a * Math.Cos(ang));
                    int y = (int)Math.Round(cy + b * Math.Sin(ang));
                    outline.Add(new int[] { x, y });
                }
                strokes.Add(outline);

                if (fill)
                {
                    for (int y = ry + spacing; y <= ry + rh - spacing; y += spacing)
                    {
                        double ny = (y - cy) / b;
                        if (Math.Abs(ny) >= 1.0) continue;
                        double dx = a * Math.Sqrt(1.0 - ny * ny);
                        int x0 = (int)Math.Round(cx - dx);
                        int x1 = (int)Math.Round(cx + dx);
                        if (x1 > x0)
                        {
                            List<int[]> scan = new List<int[]>();
                            scan.Add(new int[] { x0, y });
                            scan.Add(new int[] { x1, y });
                            strokes.Add(scan);
                        }
                    }
                }
                return strokes;
            }

            if (kind == "rect")
            {
                int rx, ry, rw, rh;
                ResolveBounds(rect, points, out rx, out ry, out rw, out rh);
                if (rw < 1 || rh < 1)
                    throw new ArgumentException("invalid_argument: rect requires rect [x,y,w,h] or 2 points");

                List<int[]> outline = new List<int[]>();
                outline.Add(new int[] { rx, ry });
                outline.Add(new int[] { rx + rw, ry });
                outline.Add(new int[] { rx + rw, ry + rh });
                outline.Add(new int[] { rx, ry + rh });
                outline.Add(new int[] { rx, ry });
                strokes.Add(outline);

                if (fill && rw >= 3)
                {
                    for (int y = ry + spacing; y <= ry + rh - spacing; y += spacing)
                    {
                        List<int[]> scan = new List<int[]>();
                        scan.Add(new int[] { rx + 1, y });
                        scan.Add(new int[] { rx + rw - 1, y });
                        strokes.Add(scan);
                    }
                }
                return strokes;
            }

            if (kind == "polygon")
            {
                if (points == null || points.Count < 3)
                    throw new ArgumentException("invalid_argument: polygon shape requires >= 3 points");

                List<int[]> poly = new List<int[]>();
                for (int i = 0; i < points.Count; i++)
                {
                    poly.Add(new int[] { points[i][0], points[i][1] });
                }
                poly.Add(new int[] { points[0][0], points[0][1] });
                strokes.Add(poly);
                return strokes;
            }

            throw new ArgumentException("invalid_argument: unsupported shape '" + shape + "'");
        }

        private static void ResolveBounds(int[] rect, List<int[]> points, out int x, out int y, out int w, out int h)
        {
            if (rect != null && rect.Length == 4)
            {
                x = rect[0];
                y = rect[1];
                w = rect[2];
                h = rect[3];
                return;
            }
            if (points != null && points.Count >= 2)
            {
                int x0 = points[0][0], y0 = points[0][1];
                int x1 = points[1][0], y1 = points[1][1];
                x = Math.Min(x0, x1);
                y = Math.Min(y0, y1);
                w = Math.Abs(x1 - x0);
                h = Math.Abs(y1 - y0);
                return;
            }
            x = 0; y = 0; w = 0; h = 0;
        }

        private static void AppendQuadratic(List<int[]> outPts, int[] p0, int[] p1, int[] p2, int segs)
        {
            for (int s = 1; s <= segs; s++)
            {
                double t = (double)s / segs;
                double u = 1.0 - t;
                int x = (int)Math.Round(u * u * p0[0] + 2.0 * u * t * p1[0] + t * t * p2[0]);
                int y = (int)Math.Round(u * u * p0[1] + 2.0 * u * t * p1[1] + t * t * p2[1]);
                outPts.Add(new int[] { x, y });
            }
        }

        private static void AppendCubic(List<int[]> outPts, int[] p0, int[] p1, int[] p2, int[] p3, int segs)
        {
            for (int s = 1; s <= segs; s++)
            {
                double t = (double)s / segs;
                double u = 1.0 - t;
                double u2 = u * u;
                double t2 = t * t;
                int x = (int)Math.Round(u2 * u * p0[0] + 3.0 * u2 * t * p1[0] + 3.0 * u * t2 * p2[0] + t2 * t * p3[0]);
                int y = (int)Math.Round(u2 * u * p0[1] + 3.0 * u2 * t * p1[1] + 3.0 * u * t2 * p2[1] + t2 * t * p3[1]);
                outPts.Add(new int[] { x, y });
            }
        }
    }
}
