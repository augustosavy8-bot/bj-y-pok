/**
 * Tiempos del ciclo de blackjack. Fuente única: los usan el motor 24/7 del
 * servidor, la vista del jugador (cuenta regresiva) y la del crupier. Si se
 * desincronizan, el reloj que ve el jugador miente respecto de cuándo reparte
 * de verdad el servidor.
 */
export const MS_VENTANA_APUESTAS = 10_000; // ventana para apostar
export const MS_ENTRE_RONDAS = 3_000; // pausa para ver el resultado
export const MS_SEGURO = 8_000; // ventana para decidir el seguro
