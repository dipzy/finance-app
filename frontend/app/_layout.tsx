import Ionicons from '@expo/vector-icons/Ionicons';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  ErrorBoundary as ErrorBoundaryExpo,
  type ErrorBoundaryProps,
  Stack,
  type Theme,
  ThemeProvider,
  useRouter,
  useSegments,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { BloqueioApp } from '@/components/BloqueioApp';
import { GestorGastoRapido } from '@/components/GestorGastoRapido';
import { GestorLembretes } from '@/components/GestorLembretes';
import { cores, esquemaAplicado } from '@/constants/tema';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { GruposProvider } from '../contexts/ParceriasContext';
import { obterIdioma } from '../i18n';
import { envolverApp, iniciarErros, registarErro } from '../services/erros';
import { sincronizarTemaNoArranque } from '../services/tema';
import { limitarEscalaDeLetra } from '../utils/acessibilidade';

// Monitorização de erros (Sentry): só liga com EXPO_PUBLIC_SENTRY_DSN (services/erros.ts)
iniciarErros();
// A letra acompanha a definição do telemóvel, até um teto (utils/acessibilidade.ts)
limitarEscalaDeLetra();

// Apanha os erros do Layout e dos ecrãs: mostra o ecrã de erro do Expo Router e avisa o Sentry
export function ErrorBoundary(props: ErrorBoundaryProps) {
  const { error } = props;
  useEffect(() => {
    registarErro(error, { origem: 'ErrorBoundary' });
  }, [error]);
  return <ErrorBoundaryExpo {...props} />;
}

export const unstable_settings = {
  // Abrir a app diretamente num ecrã interno mantém o login por baixo (para o botão de voltar)
  initialRouteName: 'login',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// O tema da navegação usa as cores do design (sem clarões de outra cor entre ecrãs)
const base = esquemaAplicado === 'claro' ? DefaultTheme : DarkTheme;
const temaNavegacao: Theme = {
  ...base,
  colors: {
    ...base.colors,
    primary: cores.primaria,
    background: cores.fundo,
    card: cores.fundoAlto,
    text: cores.texto,
    border: cores.borda,
    notification: cores.negativo,
  },
};

function RootLayout() {
  // Cada peso é carregado do seu próprio ficheiro: importar o pacote todo levaria todos os pesos para a app
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    ...Ionicons.font,
  });

  // O idioma guardado no dispositivo (só se sabe depois de ler o AsyncStorage): esperar para não
  // "piscar" um idioma e trocar logo a seguir
  const [idiomaPronto, setIdiomaPronto] = useState(false);
  useEffect(() => {
    obterIdioma().then(() => setIdiomaPronto(true));
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // A aparência escolhida (Sistema/Claro/Escuro): se as cores do arranque não forem as dela, a app
  // reinicia uma vez com o ecrã de abertura ainda à vista
  const [temaPronto, setTemaPronto] = useState(false);
  useEffect(() => {
    sincronizarTemaNoArranque().then((aReiniciar) => !aReiniciar && setTemaPronto(true));
  }, []);

  if (!loaded || !idiomaPronto || !temaPronto) {
    return null;
  }

  return <RootLayoutNav />;
}

export default envolverApp(RootLayout);

// Proteger rotas - redireciona para login se não autenticado
function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirecionar para login se não autenticado
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirecionar para welcome se já autenticado
      router.replace('/(tabs)/welcome');
    }
  }, [isAuthenticated, isLoading, segments]);

  return null;
}

function RootLayoutNav() {
  return (
    <AuthProvider>
      <GruposProvider>
        <ThemeProvider value={temaNavegacao}>
        {/* Ícones da barra de estado em contraste com o fundo */}
        <StatusBar style={esquemaAplicado === 'claro' ? 'dark' : 'light'} />
        <ProtectedLayout />
        {/* Lembretes das despesas por pagar e do salário (só no telemóvel) */}
        <GestorLembretes />
        {/* Impressão digital / PIN ao abrir e ao voltar à app, se estiver ligado nas Definições */}
        <BloqueioApp>
          <Stack screenOptions={{ contentStyle: { backgroundColor: cores.fundo } }}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          {/* Botão rápido "+", atalhos do ícone da app e envio dos gastos guardados sem internet */}
          <GestorGastoRapido />
        </BloqueioApp>
      </ThemeProvider>
    </GruposProvider>
  </AuthProvider>
  );
}
