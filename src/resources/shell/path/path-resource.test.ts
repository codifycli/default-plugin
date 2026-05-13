import { describe, expect, it } from 'vitest';
import { PathResource } from './path-resource';

describe('PathResource unit tests', () => {
  it('Can match path declarations', () => {
    const pathResource = new PathResource();

    const result = pathResource.findAllPathDeclarations(
`
# bun completions
[ -s "/Users/kevinwang/.bun/_bun" ] && source "/Users/kevinwang/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

export DENO_INSTALL="/Users/kevinwang/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

export PATH="$HOME/.jenv/bin:$PATH"
eval "$(jenv init -)"

export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
`)

    console.log(result);

    expect(result).toMatchObject([
      {
        declaration: 'export PATH="$BUN_INSTALL/bin:$PATH"',
        path: '$BUN_INSTALL/bin'
      },
      {
        declaration: 'export PATH="$DENO_INSTALL/bin:$PATH"',
        path: '$DENO_INSTALL/bin'
      },
      {
        declaration: 'export PATH="$HOME/.jenv/bin:$PATH"',
        path: '$HOME/.jenv/bin'
      }
    ])

  })

  it('Can match path declarations 2', () => {
    const pathResource = new PathResource();

    const result = pathResource.findAllPathDeclarations(
      `
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

alias gcc='git commit -v'
`)

    expect(result).toMatchObject([
      {
        declaration: "export PATH=\"$PYENV_ROOT/bin:$PATH\"",
        path: "$PYENV_ROOT/bin",
      }
    ])

  })

  it('Can match path declarations 3', () => {
    const pathResource = new PathResource();

    const result = pathResource.findAllPathDeclarations(
      `
export PATH=/Users/kevinwang/a/random/path:$PATH;
export PATH=/Users/kevinwang/.nvm/.bin/2:$PATH;
export PATH=/Users/kevinwang/.nvm/.bin/3:$PATH;
`);

    expect(result).toMatchObject([
      {
        declaration: 'export PATH=/Users/kevinwang/a/random/path:$PATH;',
        path: '/Users/kevinwang/a/random/path'
      },
      {
        declaration: 'export PATH=/Users/kevinwang/.nvm/.bin/2:$PATH;',
        path: '/Users/kevinwang/.nvm/.bin/2'
      },
      {
        declaration: 'export PATH=/Users/kevinwang/.nvm/.bin/3:$PATH;',
        path: '/Users/kevinwang/.nvm/.bin/3'
      }
    ])

  })

  it('Can match path declarations with ${VAR:-default} syntax', () => {
    const pathResource = new PathResource();

    const result = pathResource.findAllPathDeclarations(
      `
export PATH="\${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"
`);

    expect(result).toMatchObject([
      {
        declaration: 'export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"',
        path: '${ASDF_DATA_DIR:-$HOME/.asdf}/shims'
      }
    ])
  })

  it('Can match path declaration at end of file with no trailing newline', () => {
    const pathResource = new PathResource();

    const result = pathResource.findAllPathDeclarations(
      `export PNPM_HOME="/Users/kevinwang/Library/pnpm"
export PATH="$PNPM_HOME:$PATH"`);

    expect(result).toMatchObject([
      {
        declaration: 'export PATH="$PNPM_HOME:$PATH"',
        path: '$PNPM_HOME'
      }
    ])
  })

})
