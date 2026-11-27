using Financas.DAL;
using Financas.DAL.Entidades;
using Financas.DAL.Repositorios;
using Financas.Services.Dtos;
using Financas.Services.Interfaces;
using Financas.Services.Regras;

namespace Financas.Services;

// Grupos: criar, convidar, entrar, sair e gerir membros. As despesas e os saldos do grupo estão em
// PartilhadoService; os mealheiros em PoupancasPartilhadasService.
//
// Os convites são para um email. Quem os vê e aceita é quem tem esse email confirmado no Firebase
// (vem do token, ver ExtensoesAutenticacao.EmailVerificado): o email do perfil na app não serve,
// porque qualquer pessoa o pode mudar para o de outra.
internal sealed class GruposService(
    IUtilizadoresRepository utilizadores,
    IParceirosConvitesRepository convites,
    IGruposRepository grupos,
    IGrupoMembrosRepository grupoMembros,
    IPoupancasPartilhadasRepository poupancasPartilhadas,
    IPoupancasPartilhadasMembrosRepository contribuicoes,
    IDespesasPartilhadasRepository partilhadas,
    IDespesasExtrasRepository extras,
    IUnitOfWork unitOfWork,
    Relogio relogio) : IGruposService
{
    public async Task<IReadOnlyList<GrupoDto>> ListarAsync(string uid, CancellationToken ct = default)
    {
        var resultado = new List<GrupoDto>();
        foreach (var g in await grupos.ListarDoUtilizadorAsync(uid, ct))
        {
            resultado.Add(await ParaDtoAsync(g, uid, ct));
        }

        return resultado;
    }

    public async Task<GrupoDto?> ObterAsync(string uid, string id, CancellationToken ct = default)
    {
        var grupo = await grupos.ObterAsync(id, ct);
        if (grupo is null || await grupoMembros.ObterAtivoAsync(id, uid, ct) is null) return null;
        return await ParaDtoAsync(grupo, uid, ct);
    }

    public Task<string> CriarAsync(string uid, string nome, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var agora = relogio.Agora;
            await utilizadores.ObterOuCriarAsync(uid, agora, c);
            var grupo = new Grupo { Id = Ids.Novo(), Nome = NomeValido(nome), CriadoPorUid = uid, CriadoEm = agora };
            grupos.Adicionar(grupo);
            grupoMembros.Adicionar(new GrupoMembro
            {
                Id = Ids.Novo(),
                GrupoId = grupo.Id,
                Uid = uid,
                Role = RoleGrupo.Admin,
                EntradaEm = agora,
                CriadoEm = agora,
            });
            return grupo.Id;
        }, ct);

    public Task AlterarAsync(string uid, string id, AlterarGrupoPedido pedido, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var grupo = await grupos.ObterAsync(id, c) ?? throw new NaoEncontradoException("Grupo não encontrado.");
            await grupoMembros.ExigirAdminAsync(id, uid, "Só o admin pode alterar o grupo.", c);
            if (pedido.Nome is not null) grupo.Nome = NomeValido(pedido.Nome);
            grupo.AtualizadoEm = relogio.Agora;
        }, ct);

    // Apagar com contas por acertar ou dinheiro nos mealheiros faria esse dinheiro desaparecer.
    // As despesas pessoais (a parte de cada um) ficam no histórico de cada pessoa, já sem ligação
    public Task RemoverAsync(string uid, string id, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var grupo = await grupos.ObterAsync(id, c) ?? throw new NaoEncontradoException("Grupo não encontrado.");
            await grupoMembros.ExigirAdminAsync(id, uid, "Só o admin pode apagar o grupo.", c);

            var mealheiros = await poupancasPartilhadas.ListarDoGrupoAsync(id, c);
            if (mealheiros.Any(p => p.Saldo != 0m))
            {
                throw new PedidoInvalidoException("Os mealheiros do grupo ainda têm dinheiro: levanta-o antes de apagar o grupo.");
            }

            var despesas = await partilhadas.ListarDoGrupoAsync(id, c);
            var partes = await partilhadas.ListarPartesDasDespesasAsync([.. despesas.Select(d => d.Id)], c);
            var acertos = await partilhadas.ListarAcertosDosGruposAsync([id], c);
            if (Partilhado.Saldos(despesas, partes, acertos).Values.Any(v => v != 0m))
            {
                throw new PedidoInvalidoException("Ainda há contas por acertar no grupo: acertem as contas antes de o apagar.");
            }

            foreach (var parte in partes)
            {
                if (parte.DespesaExtraId is { } pessoalId && await extras.ObterAsync(parte.Uid, pessoalId, c) is { } pessoal)
                {
                    pessoal.DespesaPartilhadaId = null;
                }

                partilhadas.RemoverParte(parte);
            }

            foreach (var d in despesas) partilhadas.Remover(d);
            foreach (var a in acertos) partilhadas.RemoverAcerto(a);
            foreach (var p in mealheiros)
            {
                foreach (var m in await poupancasPartilhadas.ListarMovimentosAsync(p.Id, c)) poupancasPartilhadas.RemoverMovimento(m);
                foreach (var contribuicao in await contribuicoes.ListarDaPoupancaAsync(p.Id, c)) contribuicoes.Remover(contribuicao);
                poupancasPartilhadas.Remover(p);
            }

            foreach (var convite in await convites.ListarDoGrupoAsync(id, c)) convites.Remover(convite);
            foreach (var m in await grupoMembros.ListarDoGrupoAsync(id, c)) grupoMembros.Remover(m);
            grupos.Remover(grupo);
        }, ct);

    public async Task<IReadOnlyList<GrupoMembroDto>> ListarMembrosAsync(string uid, string grupoId, CancellationToken ct = default)
    {
        await grupoMembros.ExigirMembroAsync(grupoId, uid, ct);
        var resultado = new List<GrupoMembroDto>();
        foreach (var m in (await grupoMembros.ListarDoGrupoAsync(grupoId, ct)).Where(m => m.SaidaEm is null))
        {
            var utilizador = await utilizadores.ObterAsync(m.Uid, ct);
            resultado.Add(new GrupoMembroDto(m.Id, m.GrupoId, m.Uid, AcessoGrupos.NomeDe(utilizador), utilizador?.Email, m.Role, m.EntradaEm, m.Uid == uid));
        }

        return resultado;
    }

    // Qualquer membro pode convidar (como num grupo de amigos); só o admin remove pessoas
    public Task<string> ConvidarAsync(string uid, string grupoId, string email, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            _ = await grupos.ObterAsync(grupoId, c) ?? throw new NaoEncontradoException("Grupo não encontrado.");
            await grupoMembros.ExigirMembroAsync(grupoId, uid, c);

            var emailN = AcessoGrupos.NormalizarEmail(email);
            if (!EmailValido(emailN)) throw new PedidoInvalidoException("Escreve um email válido.");

            var agora = relogio.Agora;
            var eu = await utilizadores.ObterOuCriarAsync(uid, agora, c);
            if (eu.Email is { } meuEmail && AcessoGrupos.NormalizarEmail(meuEmail) == emailN)
            {
                throw new PedidoInvalidoException("Não te podes convidar a ti próprio.");
            }

            // Já é membro? Os membros ativos com este email no perfil
            foreach (var m in (await grupoMembros.ListarDoGrupoAsync(grupoId, c)).Where(m => m.SaidaEm is null))
            {
                var u = await utilizadores.ObterAsync(m.Uid, c);
                if (u?.Email is { } e && AcessoGrupos.NormalizarEmail(e) == emailN)
                {
                    throw new PedidoInvalidoException("Esta pessoa já é membro do grupo.");
                }
            }

            var pendentes = await convites.ListarPendentesDoEmailAsync(emailN, c);
            if (pendentes.Any(p => p.GrupoId == grupoId)) throw new PedidoInvalidoException("Já existe um convite pendente para este email.");

            var convite = new ParceiroConvite
            {
                Id = Ids.Novo(),
                DeUid = uid,
                GrupoId = grupoId,
                Email = emailN,
                Estado = EstadoConvite.Pendente,
                CriadoEm = agora,
            };
            convites.Adicionar(convite);
            return convite.Id;
        }, ct);

    public async Task<IReadOnlyList<ConviteGrupoDto>> ListarConvitesEnviadosAsync(string uid, string grupoId, CancellationToken ct = default)
    {
        await grupoMembros.ExigirMembroAsync(grupoId, uid, ct);
        var grupo = await grupos.ObterAsync(grupoId, ct) ?? throw new NaoEncontradoException("Grupo não encontrado.");
        var lista = (await convites.ListarDoGrupoAsync(grupoId, ct)).Where(c => c.Estado == EstadoConvite.Pendente).ToList();
        var nomes = await utilizadores.NomesAsync(lista.Select(c => c.DeUid), ct);
        return [.. lista.OrderByDescending(c => c.CriadoEm).Select(c => ParaDto(c, grupo, nomes))];
    }

    public async Task<ConvitesRecebidosDto> ListarConvitesRecebidosAsync(string uid, string? emailVerificado, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(emailVerificado)) return new ConvitesRecebidosDto(false, []);

        var resultado = new List<ConviteGrupoDto>();
        foreach (var c in await convites.ListarRecebidosPendentesAsync(AcessoGrupos.NormalizarEmail(emailVerificado), ct))
        {
            if (c.GrupoId is null || await grupos.ObterAsync(c.GrupoId, ct) is not { } grupo) continue;
            if (await grupoMembros.ObterAtivoAsync(grupo.Id, uid, ct) is not null) continue; // já lá está
            resultado.Add(ParaDto(c, grupo, await utilizadores.NomesAsync([c.DeUid], ct)));
        }

        return new ConvitesRecebidosDto(true, resultado);
    }

    public Task AceitarAsync(string uid, string? emailVerificado, string conviteId, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var convite = await ConviteParaMimAsync(emailVerificado, conviteId, c);
            var grupoId = convite.GrupoId ?? throw new NaoEncontradoException("Convite não encontrado.");
            _ = await grupos.ObterAsync(grupoId, c) ?? throw new NaoEncontradoException("Grupo não encontrado.");

            var agora = relogio.Agora;
            var utilizador = await utilizadores.ObterOuCriarAsync(uid, agora, c);
            // O email confirmado fica no perfil (assim os outros membros veem quem é)
            if (string.IsNullOrWhiteSpace(utilizador.Email)) utilizador.Email = emailVerificado;

            var membro = await grupoMembros.ObterInclusiveSaidosAsync(grupoId, uid, c);
            if (membro is null)
            {
                grupoMembros.Adicionar(new GrupoMembro
                {
                    Id = Ids.Novo(),
                    GrupoId = grupoId,
                    Uid = uid,
                    Role = RoleGrupo.Membro,
                    EntradaEm = agora,
                    CriadoEm = agora,
                });
            }
            else if (membro.SaidaEm is not null)
            {
                // Volta ao grupo: a mesma linha, como membro (as contas antigas continuam lá)
                membro.SaidaEm = null;
                membro.Role = RoleGrupo.Membro;
                membro.AtualizadoEm = agora;
            }

            convite.Estado = EstadoConvite.Aceite;
            convite.AceiteEm = agora;
            convite.AtualizadoEm = agora;
        }, ct);

    public Task RecusarAsync(string uid, string? emailVerificado, string conviteId, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var convite = await ConviteParaMimAsync(emailVerificado, conviteId, c);
            var agora = relogio.Agora;
            convite.Estado = EstadoConvite.Recusado;
            convite.RecusadoEm = agora;
            convite.AtualizadoEm = agora;
        }, ct);

    public Task CancelarConviteAsync(string uid, string conviteId, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var convite = await convites.ObterAsync(conviteId, c);
            if (convite?.GrupoId is null || convite.Estado != EstadoConvite.Pendente) return;
            var eu = await grupoMembros.ExigirMembroAsync(convite.GrupoId, uid, c);
            if (convite.DeUid != uid && eu.Role != RoleGrupo.Admin)
            {
                throw new PedidoInvalidoException("Só quem enviou o convite (ou um admin) o pode cancelar.");
            }

            convites.Remover(convite);
        }, ct);

    public Task RemoverMembroAsync(string uid, string grupoId, string membroUid, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            await grupoMembros.ExigirAdminAsync(grupoId, uid, "Só o admin pode remover membros.", c);
            if (membroUid == uid) throw new PedidoInvalidoException("Para saíres do grupo usa \"Sair do grupo\".");

            var membro = await grupoMembros.ObterAtivoAsync(grupoId, membroUid, c) ?? throw new NaoEncontradoException("Membro não encontrado.");
            if (membro.Role == RoleGrupo.Admin) throw new PedidoInvalidoException("Não podes remover outro admin. Tira-lhe primeiro o admin.");
            await TirarDoGrupoAsync(membro, c);
        }, ct);

    public Task SairAsync(string uid, string grupoId, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            var membro = await grupoMembros.ExigirMembroAsync(grupoId, uid, c);
            var ativos = (await grupoMembros.ListarDoGrupoAsync(grupoId, c)).Where(m => m.SaidaEm is null).ToList();
            if (ativos.Count == 1) throw new PedidoInvalidoException("És a única pessoa no grupo: apaga o grupo em vez de sair.");
            if (membro.Role == RoleGrupo.Admin && ativos.Count(m => m.Role == RoleGrupo.Admin) == 1)
            {
                throw new PedidoInvalidoException("És o único admin: torna outra pessoa admin antes de saíres.");
            }

            await TirarDoGrupoAsync(membro, c);
        }, ct);

    public Task AlterarRoleAsync(string uid, string grupoId, string membroUid, RoleGrupo role, CancellationToken ct = default) =>
        unitOfWork.ExecuteInTransactionAsync(async c =>
        {
            if (!Enum.IsDefined(role)) throw new PedidoInvalidoException("Papel desconhecido.");
            await grupoMembros.ExigirAdminAsync(grupoId, uid, "Só o admin pode alterar os papéis.", c);
            if (membroUid == uid) throw new PedidoInvalidoException("Não podes alterar o teu próprio papel.");

            var membro = await grupoMembros.ObterAtivoAsync(grupoId, membroUid, c) ?? throw new NaoEncontradoException("Membro não encontrado.");
            if (membro.Role == role) return;
            membro.Role = role;
            membro.AtualizadoEm = relogio.Agora;
        }, ct);

    // ---- Auxiliares ----

    // Quem sai fica com a linha (SaidaEm) para as contas antigas continuarem a mostrar o nome e o
    // saldo; deixa de ver o grupo e de contribuir automaticamente para os mealheiros
    private async Task TirarDoGrupoAsync(GrupoMembro membro, CancellationToken ct)
    {
        var agora = relogio.Agora;
        membro.SaidaEm = agora;
        membro.Role = RoleGrupo.Membro;
        membro.AtualizadoEm = agora;
        foreach (var p in await poupancasPartilhadas.ListarDoGrupoAsync(membro.GrupoId, ct))
        {
            if (await contribuicoes.ObterDoMembroAsync(p.Id, membro.Uid, ct) is { } contribuicao) contribuicoes.Remover(contribuicao);
        }
    }

    private async Task<ParceiroConvite> ConviteParaMimAsync(string? emailVerificado, string conviteId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(emailVerificado))
        {
            throw new PedidoInvalidoException("Confirma o teu email (no link que o Firebase te enviou) para aceitares convites.");
        }

        var convite = await convites.ObterAsync(conviteId, ct);
        if (convite is null || convite.GrupoId is null || convite.Email != AcessoGrupos.NormalizarEmail(emailVerificado))
        {
            throw new NaoEncontradoException("Convite não encontrado.");
        }

        if (convite.Estado != EstadoConvite.Pendente) throw new PedidoInvalidoException("Este convite já foi processado.");
        return convite;
    }

    private async Task<GrupoDto> ParaDtoAsync(Grupo g, string uid, CancellationToken ct)
    {
        var lista = await grupoMembros.ListarDoGrupoAsync(g.Id, ct);
        var eu = lista.FirstOrDefault(m => m.Uid == uid);
        var despesas = await partilhadas.ListarDoGrupoAsync(g.Id, ct);
        var partes = await partilhadas.ListarPartesDasDespesasAsync([.. despesas.Select(d => d.Id)], ct);
        var acertos = await partilhadas.ListarAcertosDosGruposAsync([g.Id], ct);
        var meuSaldo = Partilhado.Saldos(despesas, partes, acertos).GetValueOrDefault(uid);
        return new GrupoDto(g.Id, g.Nome, g.CriadoPorUid, g.CriadoEm, eu?.Role ?? RoleGrupo.Membro, lista.Count(m => m.SaidaEm is null), meuSaldo);
    }

    private static ConviteGrupoDto ParaDto(ParceiroConvite c, Grupo grupo, IReadOnlyDictionary<string, string> nomes) =>
        new(c.Id, grupo.Id, grupo.Nome, c.Email, nomes.GetValueOrDefault(c.DeUid), c.Estado, c.CriadoEm);

    private static string NomeValido(string nome) =>
        string.IsNullOrWhiteSpace(nome) ? throw new PedidoInvalidoException("Escreve o nome do grupo.") : nome.Trim();

    private static bool EmailValido(string email)
    {
        var arroba = email.IndexOf('@');
        return arroba > 0 && arroba == email.LastIndexOf('@') && email.IndexOf('.', arroba) > arroba + 1 && !email.EndsWith('.') && !email.Contains(' ');
    }
}
