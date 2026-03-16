const { formatInTimeZone, toZonedTime } = require('date-fns-tz')

console.log(formatInTimeZone(new Date(), 'America/Campo_Grande', "yyyy-MM-dd'T'00:00:00.000XXX"));
console.log(formatInTimeZone(new Date(), 'America/Campo_Grande', 'dd/MM/yyyy HH:mm:ss'));
