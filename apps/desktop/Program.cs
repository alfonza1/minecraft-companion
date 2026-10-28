using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MinecraftCompanion;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        try
        {
            if (args.Length == 2 && args[0] == "--register-shortcut") { DesktopIdentity.ConfigureShortcut(Path.GetFullPath(args[1])); return; }
            string root = Path.GetFullPath(Argument(args, "--project") ?? throw new ArgumentException("Project path is required."));
            string launcher = Path.GetFullPath(Argument(args, "--launcher") ?? throw new ArgumentException("Launcher path is required."));
            if (!File.Exists(Path.Combine(root, "scripts", "Desktop.ps1")) || !File.Exists(launcher)) throw new IOException("The working copy or desktop launcher moved. Reinstall the shortcut.");
            bool test = int.TryParse(Argument(args, "--test-port"), out int port) && port is >= 1024 and <= 65535;
            using var singleton = new Mutex(true, @"Local\MinecraftCompanionDesktopWindow" + (test ? port : ""), out bool first);
            using var activate = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\MinecraftCompanionDesktopActivate" + (test ? port : ""));
            if (!first) { activate.Set(); return; }
            DesktopIdentity.ConfigureProcess();
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new CompanionWindow(root, launcher, activate, args.Contains("--updates-pending"), test ? port : null, args.Contains("--minimized")));
        }
        catch (Exception error) { MessageBox.Show(error.Message, "Minecraft Companion", MessageBoxButtons.OK, MessageBoxIcon.Error); Environment.ExitCode = 1; }
    }
    private static string? Argument(string[] args, string name) { int index = Array.IndexOf(args, name); return index >= 0 && index + 1 < args.Length ? args[index + 1] : null; }
}

internal sealed class CompanionWindow : Form
{
    private const string Dashboard = "http://127.0.0.1:4365/";
    private readonly string project, launcher;
    private readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(16, 21, 24) };
    private readonly Label status = new() { Dock = DockStyle.Fill, ForeColor = Color.FromArgb(139, 212, 172), TextAlign = ContentAlignment.MiddleCenter, Text = "MINECRAFT COMPANION\n\nOpening your workspace…", Font = new Font("Segoe UI", 15) };
    private readonly System.Windows.Forms.Timer activationTimer = new() { Interval = 300 };
    private readonly EventWaitHandle activation;
    private readonly int? testPort;
    private bool updatesPending, checking;
    private string? metadataScript;

    public CompanionWindow(string project, string launcher, EventWaitHandle activation, bool updatesPending, int? testPort, bool minimized)
    {
        this.project = project; this.launcher = launcher; this.activation = activation; this.updatesPending = updatesPending; this.testPort = testPort;
        Text = "Minecraft Companion"; BackColor = Color.FromArgb(16, 21, 24);
        Size = new Size(1420, 960); MinimumSize = new Size(960, 680); StartPosition = FormStartPosition.CenterScreen;
        Icon = new Icon(Path.Combine(Path.GetDirectoryName(launcher)!, "companion.ico"));
        if (minimized) WindowState = FormWindowState.Minimized;
        Controls.Add(web); Controls.Add(status);
        Shown += async (_, _) => await InitializeBrowser();
        activationTimer.Tick += (_, _) => { if (activation.WaitOne(0)) { if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal; if (web.CoreWebView2 != null) web.Reload(); Activate(); } };
        activationTimer.Start();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e); DesktopIdentity.ConfigureWindow(Handle, launcher);
        int dark = 1; DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
        int caption = 0x00181510; DwmSetWindowAttribute(Handle, 35, ref caption, sizeof(int));
    }

    private static bool IsDashboard(string address) => Uri.TryCreate(address, UriKind.Absolute, out var uri) && uri.Scheme == "http" && uri.Host == "127.0.0.1" && uri.Port == 4365 && uri.UserInfo.Length == 0;

    private async Task InitializeBrowser()
    {
        try
        {
            string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MinecraftCompanion", "launcher", testPort.HasValue ? "desktop-test-" + testPort : "desktop-profile");
            var options = new CoreWebView2EnvironmentOptions();
            if (testPort.HasValue) options.AdditionalBrowserArguments = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=" + testPort;
            var environment = await CoreWebView2Environment.CreateAsync(null, profile, options);
            await web.EnsureCoreWebView2Async(environment);
            var core = web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = testPort.HasValue;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.NavigationStarting += (_, args) => { if (!IsDashboard(args.Uri)) args.Cancel = true; };
            core.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                if (args.IsUserInitiated && Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.UserInfo.Length == 0)
                    Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
            };
            core.PermissionRequested += (_, args) => { if (!IsDashboard(args.Uri) || args.PermissionKind != CoreWebView2PermissionKind.Microphone) args.State = CoreWebView2PermissionState.Deny; };
            core.WebMessageReceived += HandleMessage;
            core.ProcessFailed += (_, _) => { status.Text = "The desktop view stopped. Close and reopen Minecraft Companion.\nYour companion's service is separate from this window."; status.Visible = true; status.BringToFront(); };
            core.NavigationCompleted += (_, args) => { status.Visible = !args.IsSuccess; if (!args.IsSuccess) status.Text = "Could not load your workspace.\nClose and reopen Minecraft Companion to retry."; };
            await SetDesktopMetadata();
            core.Navigate(Dashboard);
        }
        catch (Exception error) { status.Text = "Couldn't open the desktop window.\n" + error.Message + "\nRun Install-DesktopLauncher.ps1 to repair it."; }
    }

    private async Task SetDesktopMetadata()
    {
        if (metadataScript != null) web.CoreWebView2.RemoveScriptToExecuteOnDocumentCreated(metadataScript);
        metadataScript = await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("window.__COMPANION_DESKTOP__ = " + JsonSerializer.Serialize(new { updatesPending }) + ";");
    }

    private async void HandleMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!IsDashboard(args.Source)) return;
        string command;
        try { command = args.TryGetWebMessageAsString(); } catch { return; }
        if (command == "reload") web.Reload();
        else if (command == "minimize") WindowState = FormWindowState.Minimized;
        else if (command == "check-updates" && !checking) await CheckUpdates();
    }

    private async Task CheckUpdates()
    {
        checking = true;
        string receipt = Path.Combine(Path.GetDirectoryName(launcher)!, "desktop-update-" + Guid.NewGuid().ToString("N") + ".json");
        try
        {
            // The service intentionally outlives this updater. A JSON receipt
            // avoids waiting on stdout pipes inherited by background processes.
            var start = new ProcessStartInfo("powershell.exe") { CreateNoWindow = true, UseShellExecute = false, WorkingDirectory = project };
            foreach (string argument in new[] { "-NoProfile", "-NonInteractive", "-File", Path.Combine(project, "scripts", "Desktop.ps1"), "-NoOpen", "-ResultFile", receipt }) start.ArgumentList.Add(argument);
            using var child = Process.Start(start) ?? throw new IOException("Could not start the local updater.");
            await child.WaitForExitAsync();
            if (child.ExitCode != 0) throw new IOException("Local update failed. Check launcher logs in Settings → Diagnostics.");
            if (!File.Exists(receipt)) throw new IOException("Another launcher is applying changes. Try again when it finishes.");
            using var result = JsonDocument.Parse(await File.ReadAllTextAsync(receipt));
            updatesPending = result.RootElement.GetProperty("backendUpdatesPending").GetBoolean();
            await SetDesktopMetadata();
            web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "desktop-update", status = updatesPending ? "pending" : "current" }));
            if (!updatesPending) web.Reload();
        }
        catch (Exception error) { if (!IsDisposed) web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "desktop-update", status = "error", message = error.Message })); }
        finally { checking = false; if (File.Exists(receipt)) File.Delete(receipt); }
    }

    protected override void Dispose(bool disposing) { if (disposing) { activationTimer.Dispose(); web.Dispose(); Icon?.Dispose(); } base.Dispose(disposing); }
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
}
