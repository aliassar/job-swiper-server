-- Close the normalization gaps that let cross-platform copies of one job through.
--
-- The dedup trigger itself works: over 14 days, 0 cross-platform pairs shared an
-- exact key. The duplicates got in because platforms spell the same job
-- slightly differently, so the keys never matched. Measured gaps:
--
--   company  "Amazon Web Services (AWS)"   -> key "amazon web services (aws":
--            the trailing ")" was stripped as punctuation, the rest was not
--            "Emma – The Sleep Company"    en dash kept inside the key
--            "The European Central Bank"   leading "the"
--            "Sopra Steria DE", "INNOCEAN Europe", "NTT DATA DACH"  region suffix
--            "Melo Tech" vs "MeloTech"     spacing
--   title    "(f/m/div)" 177, "(f/m/div.)" 72, "(f/d/m)" 32, "(d/m/w)" 26,
--            "(h/f)" 13, "(m/f/o)" 12, "(m/f/nb)" 12, "(f/m/d/x)" 10 - gender
--            tags the old rules did not recognise, left inside the key
--            "C#/ .NET" vs "C# / .NET"      spacing around slashes
--            "Engineer (m/f/x)Neu"          Xing's "Neu" badge glued on
--
-- Validated before applying: 613 key-groups merge table-wide; 40 random company
-- merges and 30 random title merges were all the same organisation and the same
-- role. Deliberately NOT merged, because they can be different companies:
-- descriptor words such as "Lobster Data" vs "Lobster", "Black Duck Software" vs
-- "Black Duck" ("Scalable Press" and "Scalable GmbH" are unrelated firms).
-- Title words other than gender tags are kept - one word can mark a different
-- role, and "(senior)", "(java/kotlin)" and "(berlin/hybrid)" stay in the key.

CREATE OR REPLACE FUNCTION normalize_company_name(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    IF input_text IS NULL OR input_text = '' THEN
        RETURN '';
    END IF;

    result := lower(trim(input_text));

    -- whole parentheticals, including an unclosed one: "(AWS)", "(China)", "(CA"
    result := regexp_replace(result, '\([^)]*\)?', ' ', 'g');

    -- trailing domain suffix: n8n.io -> n8n
    result := regexp_replace(result, '\.(com|org|net|io|co|ai|dev|app|xyz|tech|info)\M', '', 'gi');

    -- legal-form suffixes, possibly stacked: "Foo GmbH & Co. KG" -> "foo"
    result := regexp_replace(result,
        '(\s*[,&]?\s*\m(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|mbh|ag|se|kg|kgaa|plc|bv|nv|sa|sarl|sàrl|srl|spa|oy|ab|as|aps|pte|pty|holding|group|gruppe)\M\.?)+\s*$',
        '', 'gi');

    -- trailing region: "Sopra Steria DE", "INNOCEAN Europe", "NTT DATA DACH"
    result := regexp_replace(result, '(\s+(de|germany|deutschland|europe|emea|dach))+\s*$', '', 'gi');

    result := regexp_replace(result, '^the\s+', '');

    -- punctuation and spacing carry no identity: "Emma – The Sleep", "MeloTech"
    result := regexp_replace(result, '[[:punct:]–—’´]+', ' ', 'g');
    result := regexp_replace(result, '\s+', '', 'g');

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION normalize_for_dedup(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    IF input_text IS NULL OR input_text = '' THEN
        RETURN '';
    END IF;

    result := lower(input_text);

    -- Xing appends a "Neu" badge straight after the gender tag
    result := regexp_replace(result, '\)\s*neu\s*$', ')');

    -- any parenthetical made only of gender tokens:
    -- (f/m/div.), (d/w/m), (h/f), (m/f/nb), (f/m/d/x), (m,w,d), (m|w|d) ...
    result := regexp_replace(result,
        '\(\s*(m|w|f|d|x|h|o|nb|gn|div\.?|divers)(\s*[/|,]\s*(m|w|f|d|x|h|o|nb|gn|div\.?|divers))+\s*\)',
        ' ', 'g');

    -- the original rules, unchanged
    result := regexp_replace(result, '\s*\(\s*[mwfx]\s*/\s*[mwfx]\s*/\s*[mwfdx]\s*\)', '', 'gi');
    result := regexp_replace(result, '\s*\(\s*[mwfx]\s*/\s*[mwfx]\s*\)', '', 'gi');
    result := regexp_replace(result, '\s*\(\s*all\s+genders?\s*\)', '', 'gi');
    result := regexp_replace(result, '\s*\(\s*gn\s*\)', '', 'gi');
    result := regexp_replace(result, '\s*\(\s*d/f/m\s*\)', '', 'gi');
    result := regexp_replace(result, '\s*\(\s*d/m/f\s*\)', '', 'gi');
    result := replace(result, ',', '');
    result := regexp_replace(result, '\.+$', '');
    result := regexp_replace(result, '\s+', ' ', 'g');
    result := trim(result);

    -- "C#/ .NET" and "C# / .NET" are the same title
    result := regexp_replace(result, '\s*/\s*', '/', 'g');

    RETURN trim(result);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Stored keys and expression indexes were computed with the old normalizers.
-- Rewriting company recomputes the generated dedup_key for every row; the
-- expression indexes are rebuilt explicitly, because an update that leaves the
-- underlying column unchanged may skip them.
UPDATE jobs SET company = company;
REINDEX INDEX jobs_dedup_key_idx;
REINDEX INDEX jobs_dedup_company_idx;
REINDEX INDEX jobs_dedup_position_idx;
