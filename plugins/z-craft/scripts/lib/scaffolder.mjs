/**
 * Z-Craft 4-State Component Scaffolder
 * Generates enterprise UI boilerplate satisfying R_UX_MATRIX (AS-12) and canonical Anti-Slop laws.
 */

export function scaffoldComponent(title = "InventoryManagement", options = {}) {
  const framework = (options.framework || "react").toLowerCase();
  const componentName = title.replace(/[^a-zA-Z0-9]/g, "");

  if (framework === "wpf" || framework === "xaml") {
    return scaffoldWpf(componentName, title);
  }

  if (framework === "winforms") {
    return scaffoldWinForms(componentName, title);
  }

  return scaffoldReact(componentName, title);
}

function scaffoldReact(name, title) {
  const filename = `${name}.tsx`;
  const code = `import React, { useState } from 'react';

export type UiState = 'populated' | 'loading' | 'empty' | 'error';

interface Item {
  id: string;
  code: string;
  name: string;
  quantity: number;
  status: 'InStock' | 'LowStock' | 'OutOfStock';
}

const STATUS_LABELS: Record<Item['status'], string> = {
  InStock: 'Còn hàng',
  LowStock: 'Sắp hết',
  OutOfStock: 'Hết hàng',
};

const STATE_LABELS: Record<UiState, string> = {
  populated: 'Dữ liệu',
  loading: 'Đang tải',
  empty: 'Trống',
  error: 'Lỗi',
};

const MOCK_ITEMS: Item[] = [
  { id: '1', code: 'MAT-2026-001', name: 'Thép hình chữ H 150x150', quantity: 125, status: 'InStock' },
  { id: '2', code: 'MAT-2026-002', name: 'Tôn mạ kẽm độ dày 1.2mm', quantity: 12, status: 'LowStock' },
  { id: '3', code: 'MAT-2026-003', name: 'Ống inox 304 phi 60', quantity: 0, status: 'OutOfStock' },
];

export function ${name}() {
  const [state, setState] = useState<UiState>('populated');
  const [items, setItems] = useState<Item[]>(MOCK_ITEMS);
  const [notice, setNotice] = useState<string>('');
  const [errorMessage] = useState<string>('Không thể kết nối máy chủ dữ liệu tồn kho. Kiểm tra mạng và thử lại.');

  const handleRetry = () => {
    setState('loading');
    setTimeout(() => {
      setItems(MOCK_ITEMS);
      setState('populated');
    }, 300);
  };

  const handleCreateNew = () => {
    const nextIdx = items.length + 1;
    const nextItem: Item = {
      id: String(nextIdx),
      code: \`MAT-2026-\${String(nextIdx).padStart(3, '0')}\`,
      name: 'Vật tư mới khởi tạo',
      quantity: 10,
      status: 'InStock',
    };
    setItems((prev) => [...prev, nextItem]);
    setState('populated');
    setNotice(\`Đã thêm mã \${nextItem.code}.\`);
  };

  return (
    <div className="w-full bg-surface border border-border rounded-lg p-4 font-sans text-foreground">
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">${title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Quản lý danh mục và số lượng tồn kho theo thời gian thực</p>
        </div>
        <div className="flex items-center gap-1 bg-muted p-1 rounded-md border border-border text-xs">
          {(['populated', 'loading', 'empty', 'error'] as UiState[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={\`px-2.5 py-1 rounded text-xs font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary \${
                state === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }\`}
            >
              {STATE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div role="status" className="mb-3 px-3 py-2 rounded-md border border-border bg-elevated text-xs text-foreground flex items-center justify-between">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            Đóng
          </button>
        </div>
      )}

      {state === 'loading' && (
        <div className="space-y-2 py-1" aria-busy="true" aria-label="Đang tải danh sách">
          <div className="h-9 bg-muted rounded-sm w-full animate-pulse motion-reduce:animate-none" />
          <div className="h-9 bg-muted/70 rounded-sm w-full animate-pulse motion-reduce:animate-none" />
          <div className="h-9 bg-muted/50 rounded-sm w-full animate-pulse motion-reduce:animate-none" />
        </div>
      )}

      {state === 'empty' && (
        <div className="py-10 text-center border border-border rounded-md bg-elevated">
          <svg className="w-7 h-7 mx-auto text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
          </svg>
          <p className="mt-3 text-sm font-semibold text-foreground">Chưa có vật tư nào trong kho</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Tạo mới vật tư hoặc điều chỉnh bộ lọc tìm kiếm để hiển thị dữ liệu.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={handleCreateNew}
              className="inline-flex items-center px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Thêm vật tư
            </button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div role="alert" className="p-4 rounded-md bg-destructive/10 border border-destructive/25 text-destructive">
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
            <div className="flex-1">
              <h4 className="text-xs font-semibold">Không thể tải dữ liệu</h4>
              <p className="text-xs mt-0.5">{errorMessage}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-3 px-3 py-1.5 bg-destructive text-destructive-foreground text-xs font-semibold rounded-md hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Thử lại
              </button>
            </div>
          </div>
        </div>
      )}

      {state === 'populated' && (
        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-elevated border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">
                <th className="py-2 px-3">Mã vật tư</th>
                <th className="py-2 px-3">Tên vật tư</th>
                <th className="py-2 px-3 text-right">Số lượng tồn</th>
                <th className="py-2 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {items.map((item) => (
                <tr key={item.id} className="h-9 hover:bg-hover transition-colors duration-fast">
                  <td className="px-3 font-mono tabular-nums font-medium">{item.code}</td>
                  <td className="px-3 font-medium">{item.name}</td>
                  <td className="px-3 text-right font-mono tabular-nums font-semibold">{item.quantity.toLocaleString('vi-VN')}</td>
                  <td className="px-3 text-center">
                    <span
                      className={\`inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold border \${
                        item.status === 'InStock'
                          ? 'bg-success/15 text-success border-success/25'
                          : item.status === 'LowStock'
                          ? 'bg-warning/15 text-warning border-warning/25'
                          : 'bg-destructive/15 text-destructive border-destructive/25'
                      }\`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
`;
  return { filename, code, framework: "react", states: ["populated", "loading", "empty", "error"] };
}

function scaffoldWpf(name, title) {
  const filename = `${name}View.xaml`;
  const code = `<UserControl x:Class="App.Views.${name}View"
             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
             xmlns:d="http://schemas.microsoft.com/expression/blend/2008"
             mc:Ignorable="d"
             d:DesignHeight="450" d:DesignWidth="800">
    <Grid Background="{DynamicResource BrushBgCanvas}">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
        </Grid.RowDefinitions>

        <Border Grid.Row="0" Background="{DynamicResource BrushBgSurface}" BorderBrush="{DynamicResource BrushBorderDefault}" BorderThickness="0,0,0,1" Padding="16,12">
            <TextBlock Text="${title}" FontSize="16" FontWeight="SemiBold" Foreground="{DynamicResource BrushTextPrimary}"/>
        </Border>

        <Grid Grid.Row="1" Margin="16">
            <StackPanel Visibility="{Binding IsLoading, Converter={StaticResource BooleanToVisibilityConverter}}">
                <Border Height="28" Margin="0,0,0,6" CornerRadius="4" Background="{DynamicResource BrushBgElevated}"/>
                <Border Height="28" Margin="0,0,0,6" CornerRadius="4" Background="{DynamicResource BrushBgElevated}"/>
                <Border Height="28" Margin="0,0,0,6" CornerRadius="4" Background="{DynamicResource BrushBgElevated}"/>
                <TextBlock Text="Đang tải dữ liệu..." Margin="0,4,0,0" FontSize="12" Foreground="{DynamicResource BrushTextSecondary}"/>
            </StackPanel>

            <Border VerticalAlignment="Top" Padding="16" CornerRadius="6"
                    Background="{DynamicResource BrushBgSurface}" BorderBrush="{DynamicResource BrushDangerFg}" BorderThickness="1"
                    Visibility="{Binding HasError, Converter={StaticResource BooleanToVisibilityConverter}}">
                <StackPanel>
                    <TextBlock Text="Không thể tải dữ liệu" FontSize="13" FontWeight="SemiBold" Foreground="{DynamicResource BrushDangerFg}"/>
                    <TextBlock Text="{Binding ErrorMessage}" Margin="0,4,0,12" FontSize="12" Foreground="{DynamicResource BrushTextSecondary}"/>
                    <Button Command="{Binding RetryCommand}" Content="Thử lại" HorizontalAlignment="Left" Style="{DynamicResource StyleAccentButton}"/>
                </StackPanel>
            </Border>

            <StackPanel HorizontalAlignment="Center" VerticalAlignment="Center"
                        Visibility="{Binding IsEmpty, Converter={StaticResource BooleanToVisibilityConverter}}">
                <TextBlock Text="Chưa có dữ liệu phù hợp" FontSize="13" FontWeight="SemiBold" Foreground="{DynamicResource BrushTextPrimary}" HorizontalAlignment="Center"/>
                <Button Command="{Binding CreateNewCommand}" Content="Thêm mới" Margin="0,12,0,0" Style="{DynamicResource StyleAccentButton}"/>
            </StackPanel>

            <DataGrid ItemsSource="{Binding Items}" AutoGenerateColumns="False" IsReadOnly="True"
                      RowHeight="28" HeadersVisibility="Column" GridLinesVisibility="Horizontal"
                      HorizontalGridLinesBrush="{DynamicResource BrushBorderSubtle}"
                      Background="{DynamicResource BrushBgSurface}" BorderBrush="{DynamicResource BrushBorderDefault}"
                      Visibility="{Binding IsPopulated, Converter={StaticResource BooleanToVisibilityConverter}}">
                <DataGrid.Columns>
                    <DataGridTextColumn Header="Mã" Binding="{Binding Code}" Width="120"/>
                    <DataGridTextColumn Header="Tên" Binding="{Binding Name}" Width="*"/>
                    <DataGridTextColumn Header="Số lượng" Binding="{Binding Quantity}" Width="100"/>
                </DataGrid.Columns>
            </DataGrid>
        </Grid>
    </Grid>
</UserControl>
`;
  return { filename, code, framework: "wpf", states: ["populated", "loading", "empty", "error"] };
}

function scaffoldWinForms(name, title) {
  const filename = `${name}Control.cs`;
  const code = `using System;
using System.Data;
using System.Threading.Tasks;
using System.Windows.Forms;
using DevExpress.XtraSplashScreen;

namespace App.Controls
{
    public partial class ${name}Control : DevExpress.XtraEditors.XtraUserControl
    {
        private IOverlaySplashScreenHandle _overlayHandle;

        public ${name}Control()
        {
            InitializeComponent();
        }

        public async Task LoadDataAsync()
        {
            ShowLoading();
            try
            {
                var data = await FetchDataFromServiceAsync();

                gridControl.BeginUpdate();
                try
                {
                    if (data == null || data.Rows.Count == 0)
                    {
                        gridControl.DataSource = null;
                        ShowEmptyState();
                    }
                    else
                    {
                        gridControl.DataSource = data;
                        ShowPopulatedState();
                    }
                }
                finally
                {
                    gridControl.EndUpdate();
                }
            }
            catch (Exception ex)
            {
                ShowErrorState(ex.Message);
            }
            finally
            {
                HideLoading();
            }
        }

        private void ShowLoading()
        {
            _overlayHandle = SplashScreenManager.ShowOverlayForm(this);
        }

        private void HideLoading()
        {
            if (_overlayHandle != null)
            {
                SplashScreenManager.CloseOverlayForm(_overlayHandle);
                _overlayHandle = null;
            }
        }

        private void ShowEmptyState()
        {
            pnlEmpty.Visible = true;
            pnlError.Visible = false;
            gridControl.Visible = false;
        }

        private void ShowErrorState(string message)
        {
            lblErrorMessage.Text = message;
            pnlError.Visible = true;
            pnlEmpty.Visible = false;
            gridControl.Visible = false;
        }

        private void ShowPopulatedState()
        {
            pnlError.Visible = false;
            pnlEmpty.Visible = false;
            gridControl.Visible = true;
        }

        private async Task<DataTable> FetchDataFromServiceAsync()
        {
            await Task.Delay(300);
            var dt = new DataTable();
            dt.Columns.Add("Code", typeof(string));
            dt.Columns.Add("Name", typeof(string));
            dt.Columns.Add("Quantity", typeof(decimal));
            dt.Rows.Add("MAT-001", "Vật tư thép hình", 150m);
            return dt;
        }
    }
}
`;
  return { filename, code, framework: "winforms", states: ["populated", "loading", "empty", "error"] };
}
