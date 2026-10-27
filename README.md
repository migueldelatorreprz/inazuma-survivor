# ⚡ InazumaSurvivor

Juego **fan-made, gratuito y sin ánimo de lucro** de tipo *survivor* / *bullet heaven* con roguelike, inspirado en **Inazuma Eleven**. Se juega en el navegador: eliges a tu jugador, aguantas oleadas de rivales cada vez más fuertes, subes de nivel, consigues supertécnicas, las fusionas con Hillman y te enfrentas a los equipos de la serie hasta llegar a Aphrodite y a Mark Evans.

> ⚠️ **Proyecto no oficial.** No está afiliado, patrocinado ni aprobado por LEVEL-5 Inc. ni por ninguno de los titulares de *Inazuma Eleven*. Lee el [aviso legal](#️-aviso-legal-y-propiedad-intelectual).

---

## 🎮 Cómo jugar

No hace falta instalar nada.

1. Descarga o clona el repositorio.
2. Abre `index.html` en un navegador moderno (Chrome, Edge, Firefox).
   - Si tu navegador bloquea algún recurso al abrirlo con doble clic, sírvelo en local, por ejemplo con `python -m http.server` en la carpeta del juego, y entra en `http://localhost:8000`.

### Controles

| Tecla | Acción |
|---|---|
| `WASD` / flechas | Moverse |
| `Q` / `E` | Cambiar de supertécnica (o al disparo básico si la tecla está libre) |
| `R` | Técnica definitiva |
| `1` `2` `3` `4` | Usar balones de poder |
| `Esc` / `Tab` / `P` | Pausa y estadísticas |
| `M` | Silenciar |

Dentro del juego, el apartado **Guía** del menú principal explica supertécnicas, afinidades, talentos, objetos, rivales y bosses.

## 🧩 Contenido

- 224 jugadores de Inazuma Eleven 1 con sus estadísticas, afinidad y rareza.
- Supertécnicas con evolución, técnica definitiva (R), fusiones y mezcla de 4 con Hillman.
- 9 bosses con habilidades propias, más Aphrodite y Mark Evans.
- Tienda de sobres, mejoras permanentes por jugador, talentos, objetos y balones de poder.
- Música y efectos generados por código (Web Audio).

## 📁 Estructura

```
index.html                 Página del juego
game.js                    Lógica, dibujo y sonido
style.css                  Estilos (pixel art)
players.js                 Base de datos de jugadores
assets/                    Sprites, escudos, iconos
inazuma_rogue_jugadores/   Sprites y caras de los jugadores
```

---

## 🔒 Privacidad y protección de datos

Resumen: **el juego no recoge ni envía datos personales.** Toda la información de tu partida se guarda solo en tu navegador. Política completa en [PRIVACIDAD.md](PRIVACIDAD.md).

## ⚖️ Aviso legal y propiedad intelectual

- **Inazuma Eleven**, sus personajes, nombres, equipos, escudos, diseños y demás elementos son propiedad de **LEVEL-5 Inc.** y de sus respectivos titulares. Aquí se usan solo como homenaje de fans, **sin fines comerciales**.
- Este repositorio **no reclama ningún derecho** sobre esos elementos. Si eres titular de algún derecho y quieres que se retire algún contenido, escríbeme (ver [Contacto](#-contacto)) y lo retiraré lo antes posible.
- El juego es y será **gratuito**: no se vende, no tiene compras dentro del juego, no tiene publicidad y no acepta donaciones ligadas a él. Tampoco tiene ninguna criptomoneda, token ni NFT oficial.
- El aviso legal y la política de privacidad también están dentro del juego, en **Ajustes → Acerca de**.
- Créditos de terceros (sprites, tipografías y código adaptado) en [CREDITOS.md](CREDITOS.md).

## 📜 Licencia

El **código propio** de este proyecto (`game.js`, `style.css`, `index.html` y la estructura de `players.js`) se publica bajo la licencia **[PolyForm Noncommercial 1.0.0](LICENSE.md)**:

- ✅ Puedes usarlo, estudiarlo, modificarlo y compartirlo **sin fines comerciales**, manteniendo los avisos de copyright (*Required Notice*).
- ❌ No puedes venderlo, cobrar por jugarlo ni ponerle anuncios.

Parte del sistema de oleadas, dificultad, jefes y subidas de nivel está **adaptado de [PokéSurvivor](https://github.com/JPTER78/pokesurvivor)** (Copyright 2026 JPTER78, PolyForm Noncommercial 1.0.0). Su aviso se mantiene en `LICENSE.md` y en el propio código.

La licencia **no se aplica** a los personajes, nombres, sprites ni demás material de *Inazuma Eleven* ni de terceros, que siguen perteneciendo a sus titulares.

## 👥 Créditos

Creado por **ChinoziN** y **Hezy Panxito**. Créditos completos en [CREDITOS.md](CREDITOS.md).

## 📬 Contacto

Para avisos de copyright o retirada de contenido, privacidad, errores o sugerencias:

- 📧 **migueldelatorreprz@gmail.com**
- También puedes abrir un *issue* en este repositorio.

---

<sub>InazumaSurvivor · fan game sin ánimo de lucro · 2026</sub>
