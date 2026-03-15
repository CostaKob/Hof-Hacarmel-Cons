
-- Add match_type column to registrations to distinguish ID vs name matches
ALTER TABLE public.registrations 
ADD COLUMN IF NOT EXISTS match_type text DEFAULT NULL;

-- Replace the detect_existing_student trigger function with enhanced version
CREATE OR REPLACE FUNCTION public.detect_existing_student()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- First: try to match by national ID (automatic/confirmed match)
  IF NEW.student_national_id IS NOT NULL AND NEW.student_national_id != '' THEN
    SELECT id INTO NEW.existing_student_id
    FROM public.students
    WHERE national_id = NEW.student_national_id
    LIMIT 1;
    
    IF NEW.existing_student_id IS NOT NULL THEN
      NEW.match_type := 'id_match';
      RETURN NEW;
    END IF;
  END IF;

  -- Second: try to match by first_name + last_name (possible match, needs confirmation)
  IF NEW.student_first_name IS NOT NULL AND NEW.student_last_name IS NOT NULL THEN
    SELECT id INTO NEW.existing_student_id
    FROM public.students
    WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(NEW.student_first_name))
      AND LOWER(TRIM(last_name)) = LOWER(TRIM(NEW.student_last_name))
    LIMIT 1;
    
    IF NEW.existing_student_id IS NOT NULL THEN
      NEW.match_type := 'name_match';
      RETURN NEW;
    END IF;
  END IF;

  -- No match found
  NEW.existing_student_id := NULL;
  NEW.match_type := NULL;
  RETURN NEW;
END;
$function$;
