import { PKGNAME } from './index';
import * as debug from 'debug';

export function getDebug(aftercolon?: string) {
    return debug(PKGNAME+((aftercolon) ? ':'+aftercolon : ''));
}

export const fnDebug = getDebug('fn');