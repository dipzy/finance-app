namespace Financas.Services.Tests;

// A tradução dos textos devolvidos pela API e dentro do PDF (Financas.Services/Textos.cs):
// a frontend pede "en" no cabeçalho Accept-Language; sem cabeçalho (e nos testes) fica "pt".
public class TextosTests
{
    [Fact]
    public void Pt_devolve_o_texto_igual()
    {
        Textos.Linguagem = "pt";
        Assert.Equal("Despesa não encontrada.", Textos.T("Despesa não encontrada."));
        Assert.Equal("Poupanças", Textos.T("Poupanças"));
    }

    [Fact]
    public void En_traduz_as_frases_exatas()
    {
        ComEn(() =>
        {
            Assert.Equal("Not found", Textos.T("Não encontrado"));
            Assert.Equal("Expense not found.", Textos.T("Despesa não encontrada."));
            Assert.Equal("Conflict", Textos.T("Conflito"));
            Assert.Equal("Fixed expenses", Textos.T("Despesas fixas"));
            Assert.Equal("Groceries", Textos.T("Supermercado"));
            Assert.Equal("Paid", Textos.T("Pago"));
            Assert.Equal("Page ", Textos.T("Página ")); // rodapé do PDF: "Page x of y"
            Assert.Equal(" of ", Textos.T(" de "));
        });
    }

    [Fact]
    public void En_traduz_as_frases_compostas_pelo_padrao()
    {
        ComEn(() =>
        {
            Assert.Equal("A budget for supermercado already exists: edit it instead.",
                Textos.T("Já existe um orçamento para supermercado: altera esse."));
            Assert.Equal("Choose between 1 and 12 months.", Textos.T("Escolhe entre 1 e 12 meses."));
            Assert.Equal("You made too many requests in a row. Wait 14 seconds and try again.",
                Textos.T("Fizeste demasiados pedidos seguidos. Espera 14 segundos e tenta outra vez."));
            Assert.Equal("Generated on 05/10/2026 at 14:30", Textos.T("Gerado em 05/10/2026, 14:30"));
            Assert.Equal("Last 12 months", Textos.T("Evolução dos últimos 12 meses"));
            Assert.Equal("Paid 05/10", Textos.T("Pago 05/10"));
            Assert.Equal("Renda (2 months)", Textos.T("Renda (2 meses)"));
            Assert.Equal("Renda (1 month)", Textos.T("Renda (1 mês)"));
            Assert.Equal("No history for 2026-10.", Textos.T("Sem histórico de 2026-10."));
        });
    }

    [Fact]
    public void En_traduz_as_mensagens_da_parte_partilhada()
    {
        ComEn(() =>
        {
            Assert.Equal("Group not found.", Textos.T("Grupo não encontrado."));
            Assert.Equal("The shares add up to 40.00 € but must equal the total (50.00 €).",
                Textos.T("A soma das partes (40.00 €) tem de dar o total (50.00 €)."));
            Assert.Equal("Percentages must add up to 100 (they add up to 90).", Textos.T("As percentagens têm de somar 100 (somam 90)."));
        });
    }

    [Fact]
    public void En_traduz_as_mensagens_de_validacao_dos_campos()
    {
        ComEn(() =>
        {
            Assert.Equal("titulo: required.", Textos.T("titulo: obrigatório."));
            Assert.Equal("titulo: at most 40 characters.", Textos.T("titulo: no máximo 40 caracteres."));
            Assert.Equal("valor: must be between 1 and 3.", Textos.T("valor: tem de ser entre 1 e 3."));
            Assert.Equal("data: month must be in YYYY-MM format (e.g., 2026-10).", Textos.T("data: o mês tem de estar no formato AAAA-MM (ex.: 2026-10)."));
            Assert.Equal("valor: value cannot be negative (max 9 999 999 999.99).", Textos.T("valor: o valor não pode ser negativo (máximo 9 999 999 999,99)."));
            Assert.Equal("categoria: unknown category (use one of: supermercado, restauracao).",
                Textos.T("categoria: categoria desconhecida (usa uma destas: supermercado, restauracao)."));
        });
    }

    [Fact]
    public void En_deixa_o_resto_em_portugues()
    {
        ComEn(() =>
        {
            // O que não está no dicionário (nomes escritos pelo utilizador, por exemplo) fica como está
            Assert.Equal("Qualquer coisa", Textos.T("Qualquer coisa"));
        });
    }

    private static void ComEn(Action acao)
    {
        Textos.Linguagem = "en";
        try
        {
            acao();
        }
        finally
        {
            Textos.Linguagem = "pt";
        }
    }
}