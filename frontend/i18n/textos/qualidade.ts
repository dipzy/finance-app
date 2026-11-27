// Dicionário inglês — arranque do servidor, tema claro/escuro e acessibilidade.

export const qualidade: Record<string, string> = {
  // ---- Servidor a acordar (components/AvisoServidorAcordar) ----
  'A acordar o servidor…': 'Waking up the server…',
  '{s} s · pode demorar até um minuto. A app continua a funcionar.': '{s} s · it can take up to a minute. The app keeps working.',
  '{s} s · a tentar outra vez (tentativa {n}). A app continua a funcionar.': '{s} s · trying again (attempt {n}). The app keeps working.',

  // ---- Aparência (Definições e menu lateral) ----
  'Aparência': 'Appearance',
  'Sistema': 'System',
  'Claro': 'Light',
  'Escuro': 'Dark',
  'Aparência: {opcao}': 'Appearance: {opcao}',
  'Sistema segue o modo claro ou escuro do telemóvel. Ao mudar, a app volta a abrir para aplicar as cores.':
    'System follows the light or dark mode of your phone. When you change it, the app reopens to apply the colors.',
  'Mudar para o tema claro': 'Switch to the light theme',
  'Mudar para o tema escuro': 'Switch to the dark theme',
};
