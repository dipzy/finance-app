import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Botao, CampoTexto, Cartao, Ecra } from '../components/ui';
import { brilho, comAlfa, cores, espaco, gradientes, tipografia } from '../constants/tema';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';
import { mostrarAlerta } from '../utils/helpers';

export default function LoginScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, register, recuperarPassword, isLoading } = useAuth();
  const t = useT();

  async function handleSubmit() {
    setError('');

    if (!email || !password) {
      setError(t('Por favor preenche email e password'));
      return;
    }

    if (isRegister) {
      if (!name) {
        setError(t('Por favor preenche o nome'));
        return;
      }
      // Mínimo exigido pelo Firebase
      if (password.length < 6) {
        setError(t('A password tem de ter pelo menos 6 caracteres'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('As passwords não coincidem'));
        return;
      }
    }

    // Evita duplo clique (ex.: criar a mesma conta duas vezes)
    setSubmitting(true);
    try {
      // O registo no Firebase já deixa a sessão iniciada
      const erro = isRegister
        ? await register(email, name, password, rememberMe)
        : await login(email, password, rememberMe);
      if (erro) {
        setError(erro);
      } else {
        router.replace('/(tabs)/welcome');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecuperarPassword() {
    setError('');
    if (!email) {
      setError(t('Escreve o teu email para recuperar a password'));
      return;
    }
    setSubmitting(true);
    try {
      const erro = await recuperarPassword(email);
      if (erro) {
        setError(erro);
      } else {
        mostrarAlerta(t('Email enviado'), t('Se existir uma conta com este email, vais receber um link para definir uma nova password.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const busy = isLoading || submitting;

  return (
    <Ecra centrarVertical keyboardShouldPersistTaps="handled">
      <View style={styles.marca}>
        <LinearGradient colors={gradientes.primario} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
          <Ionicons name="pulse" size={30} color={cores.sobreAcento} />
        </LinearGradient>
        <Text style={styles.title}>{t('Finanças App')}</Text>
        <Text style={styles.subtitle}>{t('A tua conta, despesas e poupanças, mês a mês')}</Text>
      </View>

      <Cartao brilho style={styles.card}>
        <Text style={styles.formTitle}>{isRegister ? t('Criar Conta') : t('Entrar')}</Text>

        {isRegister && (
          <CampoTexto
            rotulo={t('Nome')}
            value={name}
            onChangeText={setName}
            placeholder={t('Teu nome')}
          />
        )}

        <CampoTexto
          rotulo={t('Email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('exemplo@email.com')}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <CampoTexto
          rotulo={t('Password')}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••"
          secureTextEntry
        />

        {isRegister && (
          <CampoTexto
            rotulo={t('Confirmar Password')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••"
            secureTextEntry
          />
        )}

        {error ? (
          <View style={styles.error}>
            <Ionicons name="alert-circle-outline" size={18} color={cores.negativo} />
            <Text style={styles.errorTexto}>{error}</Text>
          </View>
        ) : null}

        {!isRegister && (
          <View style={styles.rememberContainer}>
            <Text style={styles.rememberText}>{t('Lembrar-me')}</Text>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              trackColor={{ false: cores.bordaForte, true: comAlfa(cores.primaria, 0.5) }}
              thumbColor={rememberMe ? cores.primaria : cores.textoSecundario}
              accessibilityLabel={t('Lembrar-me')}
            />
          </View>
        )}

        <Botao
          titulo={busy ? t('A processar...') : (isRegister ? t('Registar') : t('Entrar'))}
          icone={isRegister ? 'person-add-outline' : 'log-in-outline'}
          onPress={handleSubmit}
          aCarregar={busy}
          style={styles.button}
        />

        <Botao
          variante="fantasma"
          cor={cores.primaria}
          titulo={isRegister ? t('Já tens conta? Entrar') : t('Não tens conta? Registar')}
          onPress={() => setIsRegister(!isRegister)}
          style={styles.switchLink}
        />

        {!isRegister && (
          <Botao
            variante="fantasma"
            titulo={t('Esqueci-me da password')}
            onPress={handleRecuperarPassword}
            desativado={busy}
            style={styles.switchLink}
          />
        )}
      </Cartao>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  marca: {
    alignItems: 'center',
    marginBottom: espaco.xxl,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaco.lg,
    boxShadow: brilho(cores.primaria, 0.45, 32),
  },
  title: {
    ...tipografia.tituloEcra,
    fontSize: 32,
    textAlign: 'center',
  },
  subtitle: {
    ...tipografia.secundario,
    textAlign: 'center',
    marginTop: espaco.sm,
  },
  card: {
    padding: espaco.xxl,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: cores.superficieAlta,
  },
  rememberContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    marginBottom: espaco.lg,
  },
  rememberText: {
    ...tipografia.corpo,
    fontSize: 14,
    color: cores.textoSecundario,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    backgroundColor: comAlfa(cores.negativo, 0.1),
    borderWidth: 1,
    borderColor: comAlfa(cores.negativo, 0.35),
    borderRadius: 10,
    padding: espaco.md,
    marginBottom: espaco.md,
  },
  errorTexto: {
    ...tipografia.corpo,
    flex: 1,
    color: cores.negativo,
    fontSize: 14,
  },
  button: {
    marginTop: espaco.xs,
  },
  formTitle: {
    ...tipografia.tituloEcra,
    marginBottom: espaco.xl,
    textAlign: 'center',
  },
  switchLink: {
    marginTop: espaco.sm,
  },
});
