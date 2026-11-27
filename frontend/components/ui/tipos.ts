import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

// Nome de um ícone do Ionicons (lista em https://icons.expo.fyi/, família Ionicons)
export type NomeIcone = ComponentProps<typeof Ionicons>['name'];

// Ícone Ionicons ou um emoji (ex.: 💸), para quando não existir equivalente no Ionicons
export type IconeOuEmoji = NomeIcone | (string & {});
