// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_classy_gorgon.sql';
import m0001 from './0001_square_lady_mastermind.sql';
import m0002 from './0002_mysterious_hardball.sql';
import m0003 from './0003_sharp_arachne.sql';
import m0004 from './0004_clumsy_cable.sql';
import m0005 from './0005_graceful_zaladane.sql';
import m0006 from './0006_opposite_nightshade.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006
    }
  }
  