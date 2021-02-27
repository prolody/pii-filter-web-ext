/**
 * Counts the number of tokens in a range which are not punctuation.
 * @private
 * @param start_token the start of the token range
 * @param end_token the end of the token range
 * @param punctuation_map the punctuation to check for
 */
export function count_str_tokens(start_token, end_token, punctuation_map) {
    let n_tokens = 0;
    while (start_token != null) {
        if (start_token.index == end_token.index)
            break;
        if (!punctuation_map.has(start_token.symbol))
            n_tokens++;
        start_token = start_token.next;
    }
    return n_tokens;
}
//# sourceMappingURL=count-str-tokens.js.map