import * as Parsing from '../../../core/parsing';
import { Trie } from '../../../core/structures/trie';
import ds_date from '../dataset/ds_date.json';
// note: could also generate these regexes more cleanly
/**
 * Validate full match for a date.
 * @private
 * @param text the text to match
 */
function validate_full(text) {
    return /^(([1-2][0-9])|(3[0-1])|(0?[1-9]))e?((\svan\s)|(\s|(\s?(\-|\/|\\|\,)\s?)))((1[0-2])|(0?[1-9]))(((\s|(\s?(\-|\/|\\|\,)\s?))|(\,?\sin\s))((19[0-9][0-9])|(20[0-9][0-9])))$/.test(text) || // dmy
        /^((1[0-2])|(0?[1-9]))(((\,?\sop)?\sde\s)|(\s|(\s?(\-|\/|\\|\,)\s?)))(([1-2][0-9])|(3[0-1])|(0?[1-9]))e?\,?(((\s|(\s?(\-|\/|\\|\,)\s?))|(\sin\s))((19[0-9][0-9])|(20[0-9][0-9])))$/.test(text) || // mdy
        /^((19[0-9][0-9])|(20[0-9][0-9]))((\,?\sin\s)|(\s|(\s?(\-|\/|\\|\,)\s?)))((1[0-2])|(0?[1-9]))((\,?\sop(\sde)?\s)|(\s|(\s?(\-|\/|\\|\,)\s?)))(([1-2][0-9])|(3[0-1])|(0?[1-9]))e?$/.test(text) || // ymd
        /^((19[0-9][0-9])|(20[0-9][0-9]))((\s|(\s?(\-|\/|\\|\,)\s?))|(\,?\sop(\sde)?\s))(([1-2][0-9])|(3[0-1])|(0?[1-9]))e?((\s|(\s?(\-|\/|\\|\,)\s?))|(\svan\s))((1[0-2])|(0?[1-9]))$/.test(text);
}
/**
 * Validate partial match for a date.
 * @private
 * @param text the text to match
 */
function validate_partial(text) {
    return /^(([1-2][0-9])|(3[0-1])|(0?[1-9]))e?((\svan\s)|(\s|(\s?(\-|\/|\\|\,)\s?)))((1[0-2])|(0?[1-9]))(((\s|(\s?(\-|\/|\\|\,)\s?))|(\,?\sin\s))((19[0-9][0-9])|(20[0-9][0-9])|([0-9][0-9])))?$/.test(text) || // dmy
        /^((1[0-2])|(0?[1-9]))(((\,?\sop)?\sde\s)|(\s|(\s?(\-|\/|\\|\,)\s?)))(([1-2][0-9])|(3[0-1])|(0?[1-9]))e?\,?(((\s|(\s?(\-|\/|\\|\,)\s?))|(\sin\s))((19[0-9][0-9])|(20[0-9][0-9])|([0-9][0-9])))?$/.test(text) || // mdy
        /^((19[0-9][0-9])|(20[0-9][0-9])|([0-9][0-9]))((\,?\sin\s)|(\s|(\s?(\-|\/|\\|\,)\s?)))((1[0-2])|(0?[1-9]))((\,?\sop(\sde)?\s)|(\s|(\s?(\-|\/|\\|\,)\s?)))(([1-2][0-9])|(3[0-1])|(0?[1-9]))e?$/.test(text) || // ymd
        /^((19[0-9][0-9])|(20[0-9][0-9])|([0-9][0-9]))((\s|(\s?(\-|\/|\\|\,)\s?))|(\,?\sop(\sde)?\s))(([1-2][0-9])|(3[0-1])|(0?[1-9]))e?((\s|(\s?(\-|\/|\\|\,)\s?))|(\svan\s))((1[0-2])|(0?[1-9]))$/.test(text) || // ydm
        /^((19[0-9][0-9])|(20[0-9][0-9]))$/.test(text); // year only
}
/**
 * A simple Dutch date classifier.
 * @private
 */
export class Date extends Parsing.CoreAssociativeClassifier {
    /**
     * Creates a new Dutch Date Classifier.
     */
    constructor() {
        super(ds_date);
        /** A word-list for matching ordinals, etc. */
        this.number_match_trie = new Trie();
        /** @inheritdoc */
        this.name = 'date';
        for (let [word, value] of this.dataset['number'])
            this.number_match_trie.insert(word, value);
    }
    /** @inheritdoc */
    classify_confidence(token) {
        let parse_token = (token) => {
            let [, value] = Parsing.tokens_trie_lookup(token, this.number_match_trie);
            if (value != null)
                return value;
            else
                return token.symbol;
        };
        let has_numbers = /\d+/;
        if (has_numbers.test(parse_token(token))) {
            const min_number_length = 1; // 1 - 1
            const max_number_length = 8; // 01 - 01 - 2000
            let has_letters = /[a-zA-Z]+/;
            let has_symbols = /\-|\/|\\|\,/;
            let deferred_text = '';
            let date_value = '';
            let last_valid_date_value = '';
            let total_num_length = 0;
            let last_seen_number = null;
            let [matched, [start_token, end_token, matches]] = Parsing.collect_tokens(token, (token, deferred_matches) => {
                let token_symbol = parse_token(token);
                let token_is_space = token_symbol == ' ';
                let token_has_symbol = has_symbols.test(token_symbol);
                let token_has_d_word = /(e$)|(^in$)|(^van$)|(^de$)|(^op$)/.test(token_symbol);
                if (has_numbers.test(token_symbol)) {
                    total_num_length += token_symbol.replace(/\D+/g, '').length;
                    if (total_num_length > max_number_length)
                        return Parsing.collect_tokens.Control.INVALID;
                    date_value += deferred_text + token_symbol;
                    deferred_text = '';
                    if (total_num_length > min_number_length) {
                        last_seen_number = token;
                        if (validate_full(date_value)) {
                            last_valid_date_value = date_value.slice();
                            return Parsing.collect_tokens.Control.MATCH;
                        }
                        if (validate_partial(date_value)) {
                            last_valid_date_value = date_value.slice();
                            return Parsing.collect_tokens.Control.MATCH_AND_CONTINUE;
                        }
                    }
                    return Parsing.collect_tokens.Control.VALID;
                }
                else if (has_letters.test(token_symbol.toLowerCase()) && !token_has_d_word) {
                    return Parsing.collect_tokens.Control.INVALID;
                }
                else if (token_has_symbol || token_is_space || token_has_d_word) {
                    if (deferred_matches.length == 6) //1950, op de >^22e
                        return Parsing.collect_tokens.Control.INVALID;
                    deferred_text += token_symbol;
                    return Parsing.collect_tokens.Control.DEFER_VALID;
                }
                return Parsing.collect_tokens.Control.INVALID;
            });
            let is_year = /^((19[0-9][0-9])|(20[0-9][0-9]))$/.test(last_valid_date_value);
            if (!matched || (last_seen_number != end_token && !is_year)) {
                return [[], new Parsing.CoreClassificationScore(0.0, 0.0, this)];
            }
            else {
                let score = (total_num_length > 4 ? 0.75 :
                    (total_num_length > 2 && !is_year ? 0.35 : 0.1));
                let severity_sum = (total_num_length > 4 ? 0.15 : 0.05);
                let assoc_sum = 0.0;
                let [assoc_sum_, severity_sum_] = Parsing.calc_assoc_severity_sum(start_token, end_token, this, this.language_model, this.language_model.max_assoc_distance);
                assoc_sum += assoc_sum_;
                severity_sum += severity_sum_;
                return [matches, new Parsing.CoreClassificationScore(Math.min(score + assoc_sum, 1.0), Math.min(severity_sum, 1.0), this)];
            }
        }
        else {
            return [[], new Parsing.CoreClassificationScore(0.0, 0.0, this)];
        }
    }
}
;
//# sourceMappingURL=date.js.map