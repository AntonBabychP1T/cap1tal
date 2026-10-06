/**
 * Every threshold the спостереження are decided by, stated once (observations design D3).
 *
 * Each is a **[PROPOSED]** default the owner may overturn (vision §19), as the тренди of the пакет
 * already are: overturning one is editing its constant here, and the scenarios that pin it change
 * with it. Nothing else in `src/observations/` holds a number of its own.
 */

/**
 * The window a типова сума is read over: the six most recent завершені активні місяці of the
 * currency before the month. Six is the місячна норма витрат's own window — half a year, long
 * enough that one holiday does not become «usual», short enough that last year's rent does not.
 */
export const WINDOW_MONTHS = 6;

/**
 * Fewer than three such months and there is no типова сума at all. A median of two is the mean of
 * two, and «usual» needs a middle; three is the least history that has one.
 */
export const WINDOW_MIN_MONTHS = 3;

/**
 * The поріг помітності: 3 % of the currency's типова сума of витрачено, in basis points. A
 * difference smaller than that is not worth a sentence, whatever its percentage: Кава doubling from
 * 300 to 600 ₴ is a 100 % change and nothing the owner needs pointing at in a 60 000 ₴ month.
 */
export const NOTICEABLE_BP = 300;

/**
 * ±25 % against the типова сума is unusual. Groceries wander by a tenth from month to month;
 * a quarter is the point where the owner would say «this month was different».
 */
export const TYPICAL_BAND_BP = 2500;

/** «Третій місяць поспіль»: two rises in a row are a coincidence; three are a direction. */
export const RUN_MIN = 3;

/**
 * A regular payment stays within 5 % of its usual сума, and has changed when it leaves that band.
 * Wide enough for a subscription charged in hryvnia at a moving rate (41 000 → 41 500 → 40 800),
 * narrow enough that Netflix going from 299 to 349 ₴ (+17 %) is plainly a new price.
 */
export const PRICE_BAND_BP = 500;

/**
 * The charge nearest the usual сума must lie within ×½..×2 of it to be the same payment at a new
 * price. Outside that it is a different purchase at the same продавець — a 1 500 ₴ order from a
 * shop that also takes a 299 ₴ subscription.
 */
export const PRICE_NEAREST_MIN_DIVISOR = 2;
export const PRICE_NEAREST_MAX_FACTOR = 2;

/** A regular payment is one charged in each of the three calendar months before the month read. */
export const PRICE_PRIOR_MONTHS = 3;

/**
 * A purchase is far above what its продавець usually costs at three times the median of its
 * earlier витрати there — read over the twelve calendar months before, and only when there are at
 * least three of them: two earlier purchases are not a «usual».
 */
export const MERCHANT_RATIO = 3;
export const MERCHANT_MIN_EARLIER = 3;
export const MERCHANT_LOOKBACK_MONTHS = 12;

/**
 * A можливий дубль is dated at most one calendar day from its pair: the bank books a purchase
 * made late in the evening on the next day, and a hand-made entry is often made the morning after.
 */
export const DUPLICATE_DAY_SPAN = 1;

/** Головний shows the first three спостереження of the current month; the rest are «Усі (N)». */
export const HOME_LIMIT = 3;

/**
 * Місяць and the підсумок місяця list the first five спостереження of the month; the rest wait
 * behind «Ще N», shown in place. Five fit a screen beside the numbers they explain.
 */
export const LIST_LIMIT = 5;

/**
 * For the first seven days of a month Головний also leads to the previous month's підсумок — the
 * week in which the owner is still finishing that month in their head.
 */
export const HOME_SUMMARY_DAYS = 7;

/** Vision §15's measure of a trusted month: коригування below 2 % of витрачено. */
export const CORRECTION_MEASURE_BP = 200;
