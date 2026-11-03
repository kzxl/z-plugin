/**
 * Z-Craft 4-State Component Scaffolder
 * Generates disciplined enterprise UI boilerplate satisfying R_UX_MATRIX (Populated, Loading, Empty, Error).
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

const MOCK_ITEMS: Item[] = [
  { id: '1', code: 'MAT-2026-001', name: 'Thép hình chữ H 150x150', quantity: 125, status: 'InStock' },
  { id: '2', code: 'MAT-2026-002', name: 'Tôn mạ kẽm độ dày 1.2mm', quantity: 12, status: 'LowStock' },
  { id: '3', code: 'MAT-2026-003', name: 'Ống inox 304 phi 60', quantity: 0, status: 'OutOfStock' },
];

export function ${name}() {
  const [state, setState] = useState<UiState>('populated');
  const [items, setItems] = useState<Item[]>(MOCK_ITEMS);
  const [errorMessage, setErrorMessage] = useState<string>('Lỗi kết nối máy chủ dịch vụ dữ liệu (HTTP 503)');

  const handleRetry = () => {
    setState('loading');
    setTimeout(() => {
      setItems(MOCK_ITEMS);
      setState('populated');
    }, 600);
  };

  const handleCreateNew = () => {
    alert('Mở form tạo mới mục dữ liệu');
  };

  return (
    <div className="w-full bg-background border border-border rounded-lg shadow-xs p-5 font-sans text-foreground">
      {/* Header & State Debugger */}
      <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">${title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Quản lý danh mục và trạng thái vận hành theo thời gian thực</p>
        </div>
        <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-md border border-border text-xs">
          {(['populated', 'loading', 'empty', 'error'] as UiState[]).map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={\`px-2.5 py-1 rounded text-xs font-medium transition-colors \${
                state === s ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }\`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 1. LOADING STATE (Skeleton Shimmers) */}
      {state === 'loading' && (
        <div className="space-y-3 py-2 animate-pulse">
          <div className="h-9 bg-muted rounded-md w-full" />
          <div className="h-10 bg-muted/70 rounded-md w-full" />
          <div className="h-10 bg-muted/50 rounded-md w-full" />
          <div className="h-10 bg-muted/30 rounded-md w-full" />
        </div>
      )}

      {/* 2. EMPTY STATE (Clear Explanation + Actionable CTA) */}
      {state === 'empty' && (
        <div className="py-12 text-center border border-dashed border-border rounded-lg bg-surface/50">
          <div className="w-10 h-10 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-bold">
            0
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">Chưa có dữ liệu tồn kho</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Hệ thống chưa ghi nhận vật tư nào trong kho này. Hãy thêm mới hoặc đồng bộ từ ERP.
          </p>
          <div className="mt-4">
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium shadow-xs hover:opacity-90"
            >
              + Tạo mới vật tư
            </button>
          </div>
        </div>
      )}

      {/* 3. ERROR STATE (Diagnostic Message + Explicit Retry CTA) */}
      {state === 'error' && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <div className="flex items-start gap-3">
            <span className="font-bold text-sm">⚠️</span>
            <div className="flex-1">
              <h4 className="text-xs font-semibold">Không thể tải dữ liệu</h4>
              <p className="text-xs mt-0.5 opacity-90">{errorMessage}</p>
              <button
                onClick={handleRetry}
                className="mt-3 px-3 py-1 bg-destructive text-destructive-foreground text-xs font-medium rounded shadow-xs hover:opacity-95"
              >
                Thử lại ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. POPULATED STATE (Clean Data Grid) */}
      {state === 'populated' && (
        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                <th className="py-2.5 px-3">Mã vật tư</th>
                <th className="py-2.5 px-3">Tên vật tư</th>
                <th className="py-2.5 px-3 text-right">Số lượng tồn</th>
                <th className="py-2.5 px-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-2 px-3 font-mono font-medium">{item.code}</td>
                  <td className="py-2 px-3 font-medium">{item.name}</td>
                  <td className="py-2 px-3 text-right font-semibold">{item.quantity}</td>
                  <td className="py-2 px-3">
                    <span
                      className={\`inline-block px-2 py-0.5 rounded text-[11px] font-medium \${
                        item.status === 'InStock'
                          ? 'bg-success/15 text-success'
                          : item.status === 'LowStock'
                          ? 'bg-warning/15 text-warning'
                          : 'bg-destructive/15 text-destructive'
                      }\`}
                    >
                      {item.status}
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
    <Grid Background="{DynamicResource MaterialDesignPaper}">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
        </Grid.RowDefinitions>

        <!-- Header -->
        <Border Grid.Row="0" BorderBrush="{DynamicResource MaterialDesignDivider}" BorderThickness="0,0,0,1" Padding="16,12">
            <TextBlock Text="${title}" Style="{DynamicResource MaterialDesignHeadline6TextBlock}"/>
        </Border>

        <!-- 4-State Matrix via VisualStateManager or DataTrigger -->
        <Grid Grid.Row="1" Margin="16">
            <!-- Loading State -->
            <StackPanel HorizontalAlignment="Center" VerticalAlignment="Center" 
                        Visibility="{Binding IsLoading, Converter={StaticResource BooleanToVisibilityConverter}}">
                <ProgressBar Style="{DynamicResource MaterialDesignCircularProgressBar}" Value="0" IsIndeterminate="True" Width="40" Height="40"/>
                <TextBlock Text="Đang tải dữ liệu..." Margin="0,12,0,0" Style="{DynamicResource MaterialDesignBody2TextBlock}"/>
            </StackPanel>

            <!-- Error State -->
            <StackPanel HorizontalAlignment="Center" VerticalAlignment="Center"
                        Visibility="{Binding HasError, Converter={StaticResource BooleanToVisibilityConverter}}">
                <TextBlock Text="⚠️ Không thể tải dữ liệu" Style="{DynamicResource MaterialDesignSubtitle1TextBlock}" Foreground="{DynamicResource MaterialDesignValidationErrorBrush}"/>
                <TextBlock Text="{Binding ErrorMessage}" Margin="0,4,0,12" Style="{DynamicResource MaterialDesignCaptionTextBlock}"/>
                <Button Command="{Binding RetryCommand}" Content="Thử lại" Style="{DynamicResource MaterialDesignRaisedButton}"/>
            </StackPanel>

            <!-- Empty State -->
            <StackPanel HorizontalAlignment="Center" VerticalAlignment="Center"
                        Visibility="{Binding IsEmpty, Converter={StaticResource BooleanToVisibilityConverter}}">
                <TextBlock Text="Chưa có dữ liệu" Style="{DynamicResource MaterialDesignSubtitle1TextBlock}"/>
                <Button Command="{Binding CreateNewCommand}" Content="+ Thêm mới" Margin="0,12,0,0" Style="{DynamicResource MaterialDesignRaisedButton}"/>
            </StackPanel>

            <!-- Populated State -->
            <DataGrid ItemsSource="{Binding Items}" AutoGenerateColumns="False" IsReadOnly="True"
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
                // R_ANTI_SLOP AS-8: Enforce BeginUpdate/EndUpdate for grid performance
                gridControl.BeginUpdate();
                var data = await FetchDataFromServiceAsync();
                
                if (data == null || data.Rows.Count == 0)
                {
                    ShowEmptyState();
                }
                else
                {
                    gridControl.DataSource = data;
                    ShowPopulatedState();
                }
            }
            catch (Exception ex)
            {
                ShowErrorState(ex.Message);
            }
            finally
            {
                gridControl.EndUpdate();
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
            await Task.Delay(300); // Mock I/O
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
