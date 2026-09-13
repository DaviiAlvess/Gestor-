# Instalar o Gestor no celular

Os dados ficam no aparelho onde você criar o perfil. Instalar no celular não copia automaticamente os registros do computador.

## Android — APK

1. No GitHub, abra [Actions → Android APK](https://github.com/DaviiAlvess/Gestor-/actions/workflows/android.yml).
2. Abra a execução mais recente com sucesso e baixe o artefato `gestor-android`.
3. Envie o `.apk` para o celular e abra o arquivo.
4. Se o Android pedir, permita instalar aplicativos desta origem.
5. Abra **Gestor** e crie seu perfil neste aparelho.

Backup e CSV usam a pasta que você escolher no Android. Restaurar backup abre o seletor de arquivos do sistema.

Este APK é de desenvolvimento, assinado com a chave de debug do GitHub Actions. Serve para uso pessoal. Não é a publicação na Play Store.

## Android — Chrome

1. Abra o endereço HTTPS do Gestor no Chrome.
2. Toque em **Instalar aplicativo** ou no menu **Instalar aplicativo**.
3. Abra o ícone na tela inicial, ainda com internet, e aguarde **Pronto para usar sem internet**.

## iPhone

1. Abra o endereço HTTPS no Safari. Se a hospedagem pedir acesso, entre com a conta proprietária.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Ative **Abrir como App da Web**, se a opção aparecer, e toque em **Adicionar**.
4. Abra o novo ícone com internet. Aguarde **Pronto para usar sem internet** antes de desconectar.
5. Crie seu perfil dentro do aplicativo instalado.

Não é um pacote IPA nem uma publicação na App Store. O iPhone pode remover arquivos locais se você apagar o aplicativo, limpar a navegação ou ficar sem espaço.

Instruções da Apple: https://support.apple.com/pt-br/guide/iphone/iphea86e5236/ios

## Atualizações

No aplicativo web instalado, abra com internet. Se aparecer atualização pronta, feche todas as janelas do Gestor e abra de novo. Isso não apaga o banco local.

No APK, uma nova versão substitui o aplicativo. Os dados do WebView em geral permanecem, mas mantenha um backup antes de atualizar.

## Publicação web

`npm run build` gera a pasta `dist`, com a versão do cache offline. Publique essa pasta em HTTPS. O endereço `127.0.0.1` é só para o computador.
