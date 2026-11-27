using QuestPDF.Drawing;
using QuestPDF.Infrastructure;

namespace Financas.Services.Relatorios;

/// <summary>
/// Configuração do QuestPDF, uma vez por processo (o Program.cs chama-a no arranque; o documento
/// volta a chamá-la por segurança, sem efeito a partir da segunda vez).
/// </summary>
public static class ConfiguracaoPdf
{
    /// <summary>A família de letra do relatório (os .ttf da pasta Fontes/, copiados com a aplicação).</summary>
    public const string Letra = "Inter";

    /// <summary>Onde ficam os .ttf, ao lado das DLLs (ver Financas.Services.csproj).</summary>
    public static string PastaFontes => Path.Combine(AppContext.BaseDirectory, "Fontes");

    private static readonly Lazy<bool> Feito = new(() =>
    {
        // Licença Community: grátis para uso pessoal e para empresas com menos de 1 M USD de receita anual
        // (ver https://www.questpdf.com/license/). Esta app é de uso pessoal.
        QuestPDF.Settings.License = LicenseType.Community;

        // Só as letras registadas aqui: o mesmo PDF no Windows e no Docker do Render (sem fontes instaladas)
        QuestPDF.Settings.UseSystemFonts = false;
        var fontes = Directory.Exists(PastaFontes) ? Directory.GetFiles(PastaFontes, "*.ttf") : [];
        if (fontes.Length == 0)
        {
            throw new InvalidOperationException($"Faltam as fontes do relatório PDF em {PastaFontes}.");
        }

        foreach (var fonte in fontes)
        {
            FontManager.RegisterFontFromFile(fonte);
        }

        return true;
    });

    public static void Configurar() => _ = Feito.Value;
}
