using System.Globalization;
using System.Text;
using Financas.Services.Dtos;

namespace Financas.Services.Relatorios;

// Os gráficos do relatório, desenhados em SVG (o QuestPDF converte-os em vetores no PDF).
// Recebem o tamanho disponível em pontos e só desenham: os números vêm já calculados.
internal static class GraficosSvg
{
    private static readonly CultureInfo Invariante = CultureInfo.InvariantCulture;

    private static string N(double valor) => valor.ToString("0.##", Invariante);

    private static string Texto(string texto) =>
        texto.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

    /// <summary>Anel da distribuição do salário, com o total ao centro.</summary>
    public static string Anel(float largura, float altura, IReadOnlyList<FatiaRelatorio> fatias, string centroTitulo, string centroValor)
    {
        var lado = Math.Min(largura, altura);
        var cx = largura / 2.0;
        var cy = altura / 2.0;
        var espessura = lado * 0.16;
        var raio = lado / 2.0 - espessura / 2.0 - 1;
        var total = (double)fatias.Where(f => f.Valor > 0).Sum(f => f.Valor);

        var svg = new StringBuilder();
        svg.Append(Invariante, $"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{N(largura)}\" height=\"{N(altura)}\" viewBox=\"0 0 {N(largura)} {N(altura)}\">");
        // Fundo do anel (sem dados fica só este)
        svg.Append(Invariante, $"<circle cx=\"{N(cx)}\" cy=\"{N(cy)}\" r=\"{N(raio)}\" fill=\"none\" stroke=\"{Cores.Linha}\" stroke-width=\"{N(espessura)}\"/>");

        if (total > 0)
        {
            var angulo = -Math.PI / 2;
            foreach (var fatia in fatias.Where(f => f.Valor > 0))
            {
                var parte = (double)fatia.Valor / total;
                var cor = Cores.DaFatia(fatia.Chave);
                if (parte >= 0.9999)
                {
                    svg.Append(Invariante, $"<circle cx=\"{N(cx)}\" cy=\"{N(cy)}\" r=\"{N(raio)}\" fill=\"none\" stroke=\"{cor}\" stroke-width=\"{N(espessura)}\"/>");
                    break;
                }

                var fim = angulo + parte * 2 * Math.PI;
                var x1 = cx + raio * Math.Cos(angulo);
                var y1 = cy + raio * Math.Sin(angulo);
                var x2 = cx + raio * Math.Cos(fim);
                var y2 = cy + raio * Math.Sin(fim);
                var grande = parte > 0.5 ? 1 : 0;
                svg.Append(Invariante, $"<path d=\"M {N(x1)} {N(y1)} A {N(raio)} {N(raio)} 0 {grande} 1 {N(x2)} {N(y2)}\" fill=\"none\" stroke=\"{cor}\" stroke-width=\"{N(espessura)}\"/>");
                angulo = fim;
            }
        }

        svg.Append(Invariante, $"<text x=\"{N(cx)}\" y=\"{N(cy - 3)}\" text-anchor=\"middle\" font-family=\"{ConfiguracaoPdf.Letra}\" font-size=\"8\" fill=\"{Cores.TextoSecundario}\">{Texto(centroTitulo)}</text>");
        svg.Append(Invariante, $"<text x=\"{N(cx)}\" y=\"{N(cy + 10)}\" text-anchor=\"middle\" font-family=\"{ConfiguracaoPdf.Letra}\" font-size=\"11\" font-weight=\"700\" fill=\"{Cores.Texto}\">{Texto(centroValor)}</text>");
        svg.Append("</svg>");
        return svg.ToString();
    }

    /// <summary>
    /// Evolução dos últimos meses: em cada mês, uma barra do que entrou e, ao lado, uma barra empilhada
    /// com despesas mensais, extras, poupado e livre. O último mês (o do relatório) fica destacado.
    /// </summary>
    public static string Evolucao(float largura, float altura, IReadOnlyList<EvolucaoMesDto> meses)
    {
        const double esquerda = 44;
        const double baixo = 16;
        const double topo = 6;
        var areaLargura = largura - esquerda - 2;
        var areaAltura = altura - baixo - topo;

        var maximo = meses.Count == 0
            ? 0
            : meses.Max(m => Math.Max((double)m.Entrou, (double)(m.DespesasMensais + m.DespesasExtras + m.Poupado + m.Livre)));
        var escala = EscalaBonita(maximo);

        var svg = new StringBuilder();
        svg.Append(Invariante, $"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{N(largura)}\" height=\"{N(altura)}\" viewBox=\"0 0 {N(largura)} {N(altura)}\">");

        // Linhas de referência e os valores do eixo
        const int divisoes = 4;
        for (var i = 0; i <= divisoes; i++)
        {
            var y = topo + areaAltura - areaAltura * i / divisoes;
            svg.Append(Invariante, $"<line x1=\"{N(esquerda)}\" y1=\"{N(y)}\" x2=\"{N(largura - 2)}\" y2=\"{N(y)}\" stroke=\"{(i == 0 ? Cores.Eixo : Cores.Linha)}\" stroke-width=\"{(i == 0 ? "0.8" : "0.5")}\"/>");
            svg.Append(Invariante, $"<text x=\"{N(esquerda - 5)}\" y=\"{N(y + 2.5)}\" text-anchor=\"end\" font-family=\"{ConfiguracaoPdf.Letra}\" font-size=\"6.5\" fill=\"{Cores.TextoSecundario}\">{Texto(FormatosPdf.EuroCompacto((decimal)(escala * i / divisoes)))}</text>");
        }

        if (meses.Count > 0 && escala > 0)
        {
            var grupo = areaLargura / meses.Count;
            var barra = Math.Min(grupo * 0.32, 14);
            double Altura(decimal valor) => Math.Max(0, (double)valor) / escala * areaAltura;

            for (var i = 0; i < meses.Count; i++)
            {
                var m = meses[i];
                var ultimo = i == meses.Count - 1;
                var centro = esquerda + grupo * i + grupo / 2;
                var base0 = topo + areaAltura;

                if (ultimo)
                {
                    svg.Append(Invariante, $"<rect x=\"{N(esquerda + grupo * i + 1)}\" y=\"{N(topo)}\" width=\"{N(grupo - 2)}\" height=\"{N(areaAltura)}\" fill=\"{Cores.Destaque}\"/>");
                }

                // Entrou
                var hEntrou = Altura(m.Entrou);
                if (hEntrou > 0)
                {
                    svg.Append(Invariante, $"<rect x=\"{N(centro - barra - 0.75)}\" y=\"{N(base0 - hEntrou)}\" width=\"{N(barra)}\" height=\"{N(hEntrou)}\" fill=\"{Cores.Entrou}\"/>");
                }

                // Para onde foi, empilhado de baixo para cima
                var y = base0;
                foreach (var (valor, cor) in new[]
                         {
                             (m.DespesasMensais, Cores.DespesasMensais),
                             (m.DespesasExtras, Cores.DespesasExtras),
                             (m.Poupado, Cores.Poupado),
                             (m.Livre, Cores.Livre),
                         })
                {
                    var h = Altura(valor);
                    if (h <= 0)
                    {
                        continue;
                    }

                    y -= h;
                    svg.Append(Invariante, $"<rect x=\"{N(centro + 0.75)}\" y=\"{N(y)}\" width=\"{N(barra)}\" height=\"{N(h)}\" fill=\"{cor}\"/>");
                }

                var rotulo = FormatosPdf.MesCurto(m.Mes);
                svg.Append(Invariante, $"<text x=\"{N(centro)}\" y=\"{N(altura - 4)}\" text-anchor=\"middle\" font-family=\"{ConfiguracaoPdf.Letra}\" font-size=\"6.5\"{(ultimo ? " font-weight=\"700\"" : "")} fill=\"{(ultimo ? Cores.Texto : Cores.TextoSecundario)}\">{Texto(rotulo)}</text>");
            }
        }

        svg.Append("</svg>");
        return svg.ToString();
    }

    // O topo do eixo: 1, 2, 2,5 ou 5 vezes uma potência de 10, logo acima do máximo
    private static double EscalaBonita(double maximo)
    {
        if (maximo <= 0)
        {
            return 0;
        }

        var potencia = Math.Pow(10, Math.Floor(Math.Log10(maximo)));
        foreach (var passo in new[] { 1, 2, 2.5, 5, 10 })
        {
            if (passo * potencia >= maximo)
            {
                return passo * potencia;
            }
        }

        return 10 * potencia;
    }
}
