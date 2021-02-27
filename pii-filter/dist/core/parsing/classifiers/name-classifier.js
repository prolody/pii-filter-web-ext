import { CoreTextClassifier } from './text-classifier';
import { CoreAssociativeClassifier } from './associative-classifier';
import { CoreClassificationScore } from '../classification';
import { Trie } from '../../structures/trie';
import { tokens_trie_lookup } from '../trie-lookup';
import { calc_assoc_severity_sum } from '../calc-assoc-severity';
/**
 * Add to the existing score based on matching rules.
 * @private
 * @param first_token the first token
 * @param tokens all tokens which are part of the classification
 * @param score the base score
 * @param language_model the language model
 * @param uppercase_classification_score_base the score for a token starting with a capital letter
 * @param pos_classification_score_base the score for a token which is classified as a name by POS tagging
 * @param pos_possible_classification_score_base the score for a token which is not yet classified by POS tagging
 */
function add_name_score(first_token, tokens, score, language_model, uppercase_classification_score_base, pos_classification_score_base, pos_possible_classification_score_base) {
    if (tokens.length > 0) {
        let any_uppercase = false;
        for (let r_token of tokens) {
            let first_letter = r_token.symbol[0];
            let first_uppercase = (first_letter == first_letter.toUpperCase() &&
                !language_model.punctuation_map.has(first_letter));
            let pos_tagged_n = first_token.tag.tag_base.toLowerCase() == 'n' &&
                first_token.tag.tag_rest.indexOf('eigen') > -1;
            if (pos_tagged_n)
                score.score += pos_classification_score_base;
            else if (first_token.tag.tag_base.toLowerCase() == language_model.pos_tagger.none_str)
                score.score += pos_possible_classification_score_base;
            if (first_uppercase) {
                score.score += uppercase_classification_score_base;
                any_uppercase = true;
            }
        }
        if (any_uppercase) {
            // adjust score to punctuation proximity
            let left_token = tokens[0];
            while (left_token.previous != null && left_token.previous.symbol == ' ')
                left_token = left_token.previous;
            if (!(left_token.previous == null ||
                (language_model.punctuation_map.has(left_token.previous.symbol) &&
                    language_model.punctuation_map.get(left_token.previous.symbol) <= 0.5)))
                score.score += uppercase_classification_score_base;
        }
    }
    return [tokens, score];
}
/**
 * A name classifier. Useful for matching names, product names, etc.
 * @private
 */
export class CoreNameClassifier extends CoreTextClassifier {
    /**
     * Creates a new CoreNameClassifier.
     * @param dataset the dataset
     * @param classification_score_base the base score for a match
     * @param uppercase_classification_score_base the score for a token starting with a capital letter
     * @param pos_classification_score_base the score for a token which is classified as a name by POS tagging
     * @param pos_possible_classification_score_base the score for a token which is not yet classified by POS tagging
     * @param severity_score_base the base severity score
     * @param main_name the key name of the main word list in the dataset
     */
    constructor(dataset, classification_score_base, uppercase_classification_score_base, pos_classification_score_base, pos_possible_classification_score_base, severity_score_base, main_name = 'main') {
        super(dataset, classification_score_base, severity_score_base, true, main_name);
        this.uppercase_classification_score_base = uppercase_classification_score_base;
        this.pos_classification_score_base = pos_classification_score_base;
        this.pos_possible_classification_score_base = pos_possible_classification_score_base;
    }
    /** @inheritdoc Classifier.classify_confidence */
    classify_confidence(token) {
        let [tokens, score] = super.classify_confidence(token);
        [tokens, score] = add_name_score(token, tokens, score, this.language_model, this.uppercase_classification_score_base, this.pos_classification_score_base, this.pos_possible_classification_score_base);
        score.score = Math.min(score.score, 1.0);
        return [tokens, score];
    }
}
;
/**
 * A multi-name classifier. Useful for matching names, product names, etc. while distinguishing between several
 * different scores and severities for the different word-lists.
 * @private
 */
export class CoreMultiNameClassifier extends CoreAssociativeClassifier {
    /**
     * Creates a new CoreMultiNameClassifier.
     * @param dataset the dataset which contains the word-lists
     * @param name_settings an array containing the settings fro each word-list
     * @param sum_results wether to sum the results or keep the highest scoring value only
     */
    constructor(dataset, name_settings, sum_results = false) {
        super(dataset);
        this.sum_results = sum_results;
        /**
         * The different word-lists and their scores.
         */
        this.tries_and_settings = new Array();
        for (let setting of name_settings) {
            this.tries_and_settings.push(new CoreMultiNameClassifier.TrieWithSettings(dataset, setting));
        }
    }
    /** @inheritdoc Classifier.classify_confidence */
    classify_confidence(token) {
        let [matches, value] = [new Array(), 0.0];
        let top_match = null;
        for (let trie_with_setting of this.tries_and_settings) {
            let [t_matches, t_value] = trie_with_setting.classify_confidence(token, false);
            if (t_value != null && (value == null || t_value > value))
                top_match = trie_with_setting;
            if (!this.sum_results && value > t_value) {
                matches = t_matches;
                value = t_value;
            }
            else if (this.sum_results) {
                if (t_matches.length > matches.length)
                    matches = t_matches;
                value += t_value;
            }
        }
        if (matches.length > 0) {
            // check for associative multipliers
            let left_it = matches[0];
            let right_it = matches[matches.length - 1];
            let [assoc_sum, severity_sum] = calc_assoc_severity_sum(left_it, right_it, this, this.language_model, this.language_model.max_assoc_distance);
            let score = new CoreClassificationScore(Math.min(value + assoc_sum, 1.0), Math.min(top_match.settings.severity_score_base + severity_sum, 1.0), this);
            [matches, score] = add_name_score(token, matches, score, this.language_model, top_match.settings.uppercase_classification_score_base, top_match.settings.pos_classification_score_base, top_match.settings.pos_possible_classification_score_base);
            return [matches, score];
        }
        else
            return [matches, new CoreClassificationScore(0.0, 0.0, this)];
    }
}
;
/**
 * @private
 */
(function (CoreMultiNameClassifier) {
    /**
     * The settings used by {@link CoreMultiNameClassifier.TrieWithSettings}.
     * @private
     */
    class Settings {
        /**
         * Creates a new CoreMultiNameClassifier.Settings.
         * @param classification_score_base the base classification score
         * @param uppercase_classification_score_base the score for a token starting with a capital letter
         * @param pos_classification_score_base the score for a token which is classified as a name by POS
         * @param pos_possible_classification_score_base the score for a token which is not yet classified by POS
         * @param severity_score_base the severity base score
         * @param dataset_name the key name for this dataset
         */
        constructor(classification_score_base, uppercase_classification_score_base, pos_classification_score_base, pos_possible_classification_score_base, severity_score_base, dataset_name) {
            this.classification_score_base = classification_score_base;
            this.uppercase_classification_score_base = uppercase_classification_score_base;
            this.pos_classification_score_base = pos_classification_score_base;
            this.pos_possible_classification_score_base = pos_possible_classification_score_base;
            this.severity_score_base = severity_score_base;
            this.dataset_name = dataset_name;
        }
    }
    CoreMultiNameClassifier.Settings = Settings;
    ;
    /**
     * The structure used by {@link CoreMultiNameClassifier}.
     * @private
     */
    class TrieWithSettings {
        /**
         * Creates a new CoreMultiNameClassifier.TrieWithSettings.
         * @param dataset the dataset
         * @param settings the settings
         */
        constructor(dataset, settings) {
            this.settings = settings;
            /**
             * The trie which contains the word-list
             */
            this.trie = new Trie();
            if (settings.dataset_name in dataset && dataset[settings.dataset_name].length > 0)
                this.trie.add_list(dataset[settings.dataset_name], settings.classification_score_base);
        }
        /**
         * Classifies the confidence for this token.
         * @param token the token to classify
         * @param use_stem wether to use the stem or the full symbol
         */
        classify_confidence(token, use_stem) {
            return tokens_trie_lookup(token, this.trie, use_stem);
        }
    }
    CoreMultiNameClassifier.TrieWithSettings = TrieWithSettings;
    ;
})(CoreMultiNameClassifier || (CoreMultiNameClassifier = {}));
;
//# sourceMappingURL=name-classifier.js.map