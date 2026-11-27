import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from 'react-native';
import type { IconeOuEmoji, NomeIcone } from './tipos';
import { IconeNotaAsas } from './IconeNotaAsas';

interface IconeProps {
  nome: IconeOuEmoji;
  size?: number;
  color?: string;
}

// Nomes de ícones podem ser:
//  - Ionicons (ex.: "flash-outline")
//  - FontAwesome5 sólido com prefixo "fa5:" (ex.: "fa5:money-bill-wave")
//  - o desenho do 💸 (nota com asas) monocromático com "nota:asas"
//  - um emoji (ex.: 💸) quando não houver equivalente num conjunto
const NOME_IONICONS = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Os ícones só enfeitam: quem usa um leitor de ecrã ouve o texto ao lado (ou o accessibilityLabel do botão)
const DECORATIVO = { accessibilityElementsHidden: true, importantForAccessibility: 'no' as const, 'aria-hidden': true as const };

export function Icone({ nome, size = 16, color }: IconeProps) {
  // Desenho monocromático da nota com asas (💸)
  if (nome === 'nota:asas') {
    return <IconeNotaAsas size={size} color={color} />;
  }
  // Família FontAwesome5 (sólido)
  if (nome.startsWith('fa5:')) {
    return <FontAwesome5 name={nome.slice(4)} size={size} color={color} solid {...DECORATIVO} />;
  }
  if (NOME_IONICONS.test(nome)) {
    return <Ionicons name={nome as NomeIcone} size={size} color={color} {...DECORATIVO} />;
  }
  return (
    <Text style={{ fontSize: size, color, lineHeight: Math.round(size * 1.2) }} accessibilityElementsHidden>
      {nome}
    </Text>
  );
}