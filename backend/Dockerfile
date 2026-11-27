# Imagem da API (Render). Contexto de build: a pasta backend/
#   docker build -t financas-api backend
#   docker run -p 8080:8080 -e ConnectionStrings__Financas="postgresql://..." financas-api
#
# Duas fases: o SDK compila e publica; a imagem final só tem o runtime do ASP.NET (mais pequena).

# ---- 1. Compilar ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Primeiro só os projetos: o "restore" fica em cache enquanto os .csproj não mudarem
COPY Financas.sln ./
COPY src/Financas.DAL/Financas.DAL.csproj src/Financas.DAL/
COPY src/Financas.Services/Financas.Services.csproj src/Financas.Services/
COPY src/Financas.Api/Financas.Api.csproj src/Financas.Api/
COPY tests/Financas.Services.Tests/Financas.Services.Tests.csproj tests/Financas.Services.Tests/
COPY tests/Financas.Api.Tests/Financas.Api.Tests.csproj tests/Financas.Api.Tests/
RUN dotnet restore Financas.sln

# Depois o código: compilar a solução toda e publicar a API
COPY . .
RUN dotnet build Financas.sln -c Release --no-restore
RUN dotnet publish src/Financas.Api/Financas.Api.csproj -c Release --no-build -o /app/publish

# ---- 2. Imagem final ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final

# O "hoje" da app é contado em Europe/Lisbon: garantir a base de dados de fusos horários
RUN [ -e /usr/share/zoneinfo/Europe/Lisbon ] || \
    (apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*)

WORKDIR /app
COPY --from=build /app/publish .

# A API escuta na porta da variável PORT (o Render define-a); sem ela, 8080
ENV ASPNETCORE_ENVIRONMENT=Production \
    PORT=8080
EXPOSE 8080

# Sem privilégios de root: o utilizador "app" (APP_UID) já vem nas imagens do .NET
USER $APP_UID

ENTRYPOINT ["dotnet", "Financas.Api.dll"]
