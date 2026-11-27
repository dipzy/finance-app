using System.Text.RegularExpressions;
using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;

namespace Financas.Services;

// Os dispositivos registados para notificações push. O token do Expo é único: se for registado por outra
// conta (outra pessoa a usar o mesmo telemóvel), passa para ela e deixa de receber os alertas da anterior.
internal sealed partial class DispositivosService(
    IUtilizadoresRepository utilizadores,
    IDispositivosPushRepository dispositivos,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IDispositivosService
{
    public const int MaximoPorUtilizador = 10;
    private static readonly string[] Plataformas = ["android", "ios", "web"];
    private static readonly string[] Idiomas = ["pt", "en"];

    public Task<DispositivoDto> RegistarAsync(string uid, RegistarDispositivoPedido pedido, CancellationToken ct = default)
    {
        var token = pedido.Token.Trim();
        if (!TokenExpo().IsMatch(token))
        {
            throw new PedidoInvalidoException("O token de notificações não é válido.");
        }

        var plataforma = pedido.Plataforma.Trim().ToLowerInvariant();
        if (!Plataformas.Contains(plataforma))
        {
            throw new PedidoInvalidoException("Plataforma desconhecida (usa android, ios ou web).");
        }

        var idioma = string.IsNullOrWhiteSpace(pedido.Idioma) ? "pt" : pedido.Idioma.Trim().ToLowerInvariant()[..Math.Min(2, pedido.Idioma.Trim().Length)];
        if (!Idiomas.Contains(idioma))
        {
            idioma = "pt";
        }

        return unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                var agora = relogio.Agora;
                await utilizadores.ObterOuCriarAsync(uid, agora, c);

                var existente = await dispositivos.ObterPorTokenAsync(token, c);
                if (existente is not null && existente.UtilizadorId == uid)
                {
                    existente.Plataforma = plataforma;
                    existente.Idioma = idioma;
                    existente.AtualizadoEm = agora;
                    return new DispositivoDto(existente.Id, existente.Plataforma, existente.Idioma);
                }

                // O telemóvel passou para outra conta: o dispositivo muda de dono
                if (existente is not null)
                {
                    dispositivos.Remover(existente);
                    await unitOfWork.SaveChangesAsync(c); // o token (índice único) fica livre antes de ser registado outra vez
                }

                // No máximo MaximoPorUtilizador: os mais antigos saem (ex.: telemóveis que já não se usam)
                var meus = await dispositivos.ListarAsync(uid, c);
                foreach (var antigo in meus.Take(Math.Max(0, meus.Count - (MaximoPorUtilizador - 1))))
                {
                    dispositivos.Remover(antigo);
                }

                var novo = new DispositivoPush
                {
                    UtilizadorId = uid,
                    Id = Ids.Novo(),
                    Token = token,
                    Plataforma = plataforma,
                    Idioma = idioma,
                    CriadoEm = agora,
                    AtualizadoEm = agora,
                };
                dispositivos.Adicionar(novo);
                return new DispositivoDto(novo.Id, novo.Plataforma, novo.Idioma);
            },
            ct);
    }

    // Só apaga o dispositivo se for do utilizador (o token de outro não se apaga)
    public Task RemoverAsync(string uid, string token, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(
            async c =>
            {
                if (await dispositivos.ObterPorTokenAsync(token.Trim(), c) is { } dispositivo && dispositivo.UtilizadorId == uid)
                {
                    dispositivos.Remover(dispositivo);
                }
            },
            ct);

    public async Task<IReadOnlyList<DispositivoDto>> ListarAsync(string uid, CancellationToken ct = default) =>
        [.. (await dispositivos.ListarAsync(uid, ct)).Select(d => new DispositivoDto(d.Id, d.Plataforma, d.Idioma))];

    [GeneratedRegex(@"^Expo(nent)?PushToken\[[^\[\]\s]+\]$")]
    private static partial Regex TokenExpo();
}
