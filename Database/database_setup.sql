--
-- PostgreSQL database dump
--

\restrict CuFG6ZubSSQ2d31oigwLwbgMAFqHjmB77nhCQRtQWGSqNxbZPPzgRhZWcwg21rH

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-04-06 18:35:18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 16389)
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- TOC entry 5159 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- TOC entry 3 (class 3079 OID 16433)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5160 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 258 (class 1255 OID 16581)
-- Name: fn_audit_zones(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_audit_zones() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO audit_log (table_modifiee, action, anciennes_donnees, nouvelles_donnees)
    VALUES ('zones_regroupement', TG_OP, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_audit_zones() OWNER TO postgres;

--
-- TOC entry 256 (class 1255 OID 16577)
-- Name: fn_gestion_distributions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_gestion_distributions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_quantite_actuelle INTEGER;
    v_seuil INTEGER;
BEGIN
    SELECT quantite_disponible, seuil_alerte 
    INTO v_quantite_actuelle, v_seuil
    FROM stocks WHERE stock_id = NEW.stock_id FOR UPDATE;

    IF v_quantite_actuelle < NEW.quantite_distribuee THEN
        RAISE EXCEPTION 'Stock insuffisant pour cette distribution.';
    END IF;

    UPDATE stocks 
    SET quantite_disponible = quantite_disponible - NEW.quantite_distribuee
    WHERE stock_id = NEW.stock_id;

    IF (v_quantite_actuelle - NEW.quantite_distribuee) <= v_seuil THEN
        INSERT INTO audit_log (table_modifiee, action, nouvelles_donnees)
        VALUES ('stocks', 'ALERTE', jsonb_build_object('stock_id', NEW.stock_id, 'statut', 'CRITIQUE'));
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_gestion_distributions() OWNER TO postgres;

--
-- TOC entry 257 (class 1255 OID 16579)
-- Name: fn_update_occupation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_update_occupation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.statut = 'active' THEN
        UPDATE zones_regroupement SET occupation_actuelle = occupation_actuelle + 1 WHERE zone_id = NEW.zone_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.statut = 'active' AND NEW.statut = 'liberee' THEN
        UPDATE zones_regroupement SET occupation_actuelle = occupation_actuelle - 1 WHERE zone_id = NEW.zone_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_update_occupation() OWNER TO postgres;

--
-- TOC entry 259 (class 1255 OID 16583)
-- Name: sp_capacite_zones(); Type: PROCEDURE; Schema: public; Owner: postgres
--

CREATE PROCEDURE public.sp_capacite_zones(OUT result refcursor)
    LANGUAGE plpgsql
    AS $$
BEGIN
    OPEN result FOR
    SELECT nom, capacite_max, occupation_actuelle, 
           (capacite_max - occupation_actuelle) AS places_disponibles,
           ROUND((occupation_actuelle::DECIMAL / capacite_max) * 100, 2) AS taux_occupation_pct
    FROM zones_regroupement
    ORDER BY taux_occupation_pct DESC;
END $$;


ALTER PROCEDURE public.sp_capacite_zones(OUT result refcursor) OWNER TO postgres;

--
-- TOC entry 293 (class 1255 OID 16589)
-- Name: sp_dispatch_stock(integer, integer, character varying, integer); Type: PROCEDURE; Schema: public; Owner: postgres
--

CREATE PROCEDURE public.sp_dispatch_stock(IN p_hub_id integer, IN p_zone_id integer, IN p_type_ressource character varying, IN p_quantite integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_hub_stock INT;
    v_zone_name VARCHAR;
BEGIN
    SELECT quantite_disponible INTO v_hub_stock FROM stocks WHERE zone_id = p_hub_id AND type_ressource = p_type_ressource;
    IF v_hub_stock IS NULL OR v_hub_stock < p_quantite THEN
        RAISE EXCEPTION 'Stock insuffisant dans l-Entrepôt Central';
    END IF;

    UPDATE stocks SET quantite_disponible = quantite_disponible - p_quantite WHERE zone_id = p_hub_id AND type_ressource = p_type_ressource;

    IF EXISTS (SELECT 1 FROM stocks WHERE zone_id = p_zone_id AND type_ressource = p_type_ressource) THEN
        UPDATE stocks SET quantite_disponible = quantite_disponible + p_quantite WHERE zone_id = p_zone_id AND type_ressource = p_type_ressource;
    ELSE
        INSERT INTO stocks (zone_id, type_ressource, quantite_disponible, seuil_alerte) VALUES (p_zone_id, p_type_ressource, p_quantite, 50);
    END IF;

    -- Jbed smit l-Zone w ktebha f l-Log
    SELECT nom INTO v_zone_name FROM zones_regroupement WHERE zone_id = p_zone_id;
    INSERT INTO activity_logs (message, type) 
    VALUES ('🚚 Dispatch Logistique: ' || p_quantite || ' ' || UPPER(p_type_ressource) || ' vers ' || v_zone_name, 'SUCCESS');
    
    COMMIT;
END;
$$;


ALTER PROCEDURE public.sp_dispatch_stock(IN p_hub_id integer, IN p_zone_id integer, IN p_type_ressource character varying, IN p_quantite integer) OWNER TO postgres;

--
-- TOC entry 270 (class 1255 OID 16587)
-- Name: sp_indice_risque_penurie(refcursor); Type: PROCEDURE; Schema: public; Owner: postgres
--

CREATE PROCEDURE public.sp_indice_risque_penurie(INOUT cursor_risque refcursor)
    LANGUAGE plpgsql
    AS $$
BEGIN
    OPEN cursor_risque FOR
    WITH stock_eau AS (
        SELECT zone_id, SUM(quantite_disponible) AS total_eau
        FROM stocks WHERE type_ressource = 'eau' GROUP BY zone_id
    )
    SELECT 
        z.zone_id, 
        z.nom, 
        z.latitude,
        z.longitude,
        CASE 
            WHEN COALESCE(se.total_eau, 0) = 0 THEN 100.00
            ELSE ROUND((z.occupation_actuelle::DECIMAL / se.total_eau) * 100, 2)
        END AS risque_penurie
    FROM zones_regroupement z
    LEFT JOIN stock_eau se ON z.zone_id = se.zone_id;
END $$;


ALTER PROCEDURE public.sp_indice_risque_penurie(INOUT cursor_risque refcursor) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 236 (class 1259 OID 16611)
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_logs (
    log_id integer NOT NULL,
    action_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    message character varying(255) NOT NULL,
    type character varying(50) DEFAULT 'INFO'::character varying
);


ALTER TABLE public.activity_logs OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 16610)
-- Name: activity_logs_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.activity_logs_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.activity_logs_log_id_seq OWNER TO postgres;

--
-- TOC entry 5161 (class 0 OID 0)
-- Dependencies: 235
-- Name: activity_logs_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.activity_logs_log_id_seq OWNED BY public.activity_logs.log_id;


--
-- TOC entry 234 (class 1259 OID 16567)
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    log_id integer NOT NULL,
    table_modifiee character varying(50),
    action character varying(10),
    anciennes_donnees jsonb,
    nouvelles_donnees jsonb,
    date_action timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 16566)
-- Name: audit_log_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_log_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_log_log_id_seq OWNER TO postgres;

--
-- TOC entry 5162 (class 0 OID 0)
-- Dependencies: 233
-- Name: audit_log_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_log_log_id_seq OWNED BY public.audit_log.log_id;


--
-- TOC entry 230 (class 1259 OID 16527)
-- Name: distributions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.distributions (
    distribution_id integer NOT NULL,
    stock_id integer,
    user_id integer,
    quantite_distribuee integer NOT NULL,
    date_distribution timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT distributions_quantite_distribuee_check CHECK ((quantite_distribuee > 0))
);


ALTER TABLE public.distributions OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16526)
-- Name: distributions_distribution_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.distributions_distribution_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.distributions_distribution_id_seq OWNER TO postgres;

--
-- TOC entry 5163 (class 0 OID 0)
-- Dependencies: 229
-- Name: distributions_distribution_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.distributions_distribution_id_seq OWNED BY public.distributions.distribution_id;


--
-- TOC entry 232 (class 1259 OID 16548)
-- Name: reservations_tentes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservations_tentes (
    reservation_id integer NOT NULL,
    zone_id integer,
    emplacement_numero integer NOT NULL,
    cin_sinistre character varying(20) NOT NULL,
    statut character varying(20) DEFAULT 'active'::character varying,
    date_reservation timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reservations_tentes_statut_check CHECK (((statut)::text = ANY ((ARRAY['active'::character varying, 'liberee'::character varying, 'annulee'::character varying])::text[])))
);


ALTER TABLE public.reservations_tentes OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 16547)
-- Name: reservations_tentes_reservation_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reservations_tentes_reservation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reservations_tentes_reservation_id_seq OWNER TO postgres;

--
-- TOC entry 5164 (class 0 OID 0)
-- Dependencies: 231
-- Name: reservations_tentes_reservation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reservations_tentes_reservation_id_seq OWNED BY public.reservations_tentes.reservation_id;


--
-- TOC entry 228 (class 1259 OID 16509)
-- Name: stocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stocks (
    stock_id integer NOT NULL,
    zone_id integer,
    type_ressource character varying(50),
    quantite_disponible integer DEFAULT 0 NOT NULL,
    seuil_alerte integer DEFAULT 20,
    CONSTRAINT stocks_quantite_disponible_check CHECK ((quantite_disponible >= 0)),
    CONSTRAINT stocks_type_ressource_check CHECK (((type_ressource)::text = ANY ((ARRAY['eau'::character varying, 'tente'::character varying, 'kit_medical'::character varying, 'nourriture'::character varying])::text[])))
);


ALTER TABLE public.stocks OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16508)
-- Name: stocks_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stocks_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stocks_stock_id_seq OWNER TO postgres;

--
-- TOC entry 5165 (class 0 OID 0)
-- Dependencies: 227
-- Name: stocks_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stocks_stock_id_seq OWNED BY public.stocks.stock_id;


--
-- TOC entry 226 (class 1259 OID 16488)
-- Name: utilisateurs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.utilisateurs (
    user_id integer NOT NULL,
    email character varying(150) NOT NULL,
    mot_de_passe_hash character varying(255) NOT NULL,
    mot_de_passe_salt character varying(100) NOT NULL,
    role character varying(20),
    zone_id integer,
    nom character varying(150),
    CONSTRAINT utilisateurs_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'operateur'::character varying, 'observateur'::character varying])::text[])))
);


ALTER TABLE public.utilisateurs OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16487)
-- Name: utilisateurs_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.utilisateurs_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.utilisateurs_user_id_seq OWNER TO postgres;

--
-- TOC entry 5166 (class 0 OID 0)
-- Dependencies: 225
-- Name: utilisateurs_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.utilisateurs_user_id_seq OWNED BY public.utilisateurs.user_id;


--
-- TOC entry 224 (class 1259 OID 16473)
-- Name: zones_regroupement; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.zones_regroupement (
    zone_id integer NOT NULL,
    nom character varying(100) NOT NULL,
    capacite_max integer NOT NULL,
    occupation_actuelle integer DEFAULT 0,
    statut character varying(20) DEFAULT 'actif'::character varying,
    date_creation timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    latitude numeric(10,8),
    longitude numeric(11,8),
    is_hub boolean DEFAULT false,
    CONSTRAINT zones_regroupement_capacite_max_check CHECK ((capacite_max > 0)),
    CONSTRAINT zones_regroupement_statut_check CHECK (((statut)::text = ANY ((ARRAY['actif'::character varying, 'plein'::character varying, 'ferme'::character varying])::text[])))
);


ALTER TABLE public.zones_regroupement OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16472)
-- Name: zones_regroupement_zone_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.zones_regroupement_zone_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.zones_regroupement_zone_id_seq OWNER TO postgres;

--
-- TOC entry 5167 (class 0 OID 0)
-- Dependencies: 223
-- Name: zones_regroupement_zone_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.zones_regroupement_zone_id_seq OWNED BY public.zones_regroupement.zone_id;


--
-- TOC entry 4956 (class 2604 OID 16614)
-- Name: activity_logs log_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs ALTER COLUMN log_id SET DEFAULT nextval('public.activity_logs_log_id_seq'::regclass);


--
-- TOC entry 4954 (class 2604 OID 16570)
-- Name: audit_log log_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN log_id SET DEFAULT nextval('public.audit_log_log_id_seq'::regclass);


--
-- TOC entry 4949 (class 2604 OID 16530)
-- Name: distributions distribution_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distributions ALTER COLUMN distribution_id SET DEFAULT nextval('public.distributions_distribution_id_seq'::regclass);


--
-- TOC entry 4951 (class 2604 OID 16551)
-- Name: reservations_tentes reservation_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations_tentes ALTER COLUMN reservation_id SET DEFAULT nextval('public.reservations_tentes_reservation_id_seq'::regclass);


--
-- TOC entry 4946 (class 2604 OID 16512)
-- Name: stocks stock_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stocks ALTER COLUMN stock_id SET DEFAULT nextval('public.stocks_stock_id_seq'::regclass);


--
-- TOC entry 4945 (class 2604 OID 16491)
-- Name: utilisateurs user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utilisateurs ALTER COLUMN user_id SET DEFAULT nextval('public.utilisateurs_user_id_seq'::regclass);


--
-- TOC entry 4940 (class 2604 OID 16476)
-- Name: zones_regroupement zone_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.zones_regroupement ALTER COLUMN zone_id SET DEFAULT nextval('public.zones_regroupement_zone_id_seq'::regclass);


--
-- TOC entry 5153 (class 0 OID 16611)
-- Dependencies: 236
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_logs (log_id, action_time, message, type) FROM stdin;
\.


--
-- TOC entry 5151 (class 0 OID 16567)
-- Dependencies: 234
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_log (log_id, table_modifiee, action, anciennes_donnees, nouvelles_donnees, date_action) FROM stdin;
1	zones_regroupement	UPDATE	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 0}	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 1}	2026-03-28 02:39:13.854992
2	zones_regroupement	UPDATE	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 1}	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 2}	2026-03-28 02:39:13.854992
3	zones_regroupement	UPDATE	{"nom": "Centre Aourir (Zone Nord)", "statut": "actif", "zone_id": 2, "capacite_max": 1500, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 0}	{"nom": "Centre Aourir (Zone Nord)", "statut": "actif", "zone_id": 2, "capacite_max": 1500, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 1}	2026-03-28 02:39:13.854992
4	zones_regroupement	UPDATE	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 2}	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 3}	2026-03-29 21:30:05.497738
5	zones_regroupement	UPDATE	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "latitude": null, "longitude": null, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 3}	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "latitude": 30.43500000, "longitude": -9.52400000, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 3}	2026-03-30 00:29:46.146022
6	zones_regroupement	UPDATE	{"nom": "Centre Aourir (Zone Nord)", "statut": "actif", "zone_id": 2, "latitude": null, "longitude": null, "capacite_max": 1500, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 1}	{"nom": "Centre Aourir (Zone Nord)", "statut": "actif", "zone_id": 2, "latitude": 30.49900000, "longitude": -9.64500000, "capacite_max": 1500, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 1}	2026-03-30 00:29:46.146022
7	zones_regroupement	UPDATE	{"nom": "Hôpital Hassan II (Urgence Médicale)", "statut": "actif", "zone_id": 3, "latitude": null, "longitude": null, "capacite_max": 800, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 0}	{"nom": "Hôpital Hassan II (Urgence Médicale)", "statut": "actif", "zone_id": 3, "latitude": 30.40700000, "longitude": -9.58100000, "capacite_max": 800, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 0}	2026-03-30 00:29:46.146022
8	zones_regroupement	UPDATE	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "latitude": 30.43500000, "longitude": -9.52400000, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 3}	{"nom": "Stade Adrar (Camp Principal)", "statut": "actif", "zone_id": 1, "latitude": 30.42739400, "longitude": -9.54038100, "capacite_max": 5000, "date_creation": "2026-03-28T02:39:13.854992", "occupation_actuelle": 3}	2026-03-30 01:14:02.319507
9	stocks	ALERTE	\N	{"statut": "CRITIQUE", "stock_id": 6}	2026-04-02 00:05:19.173433
\.


--
-- TOC entry 5147 (class 0 OID 16527)
-- Dependencies: 230
-- Data for Name: distributions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.distributions (distribution_id, stock_id, user_id, quantite_distribuee, date_distribution) FROM stdin;
\.


--
-- TOC entry 5149 (class 0 OID 16548)
-- Dependencies: 232
-- Data for Name: reservations_tentes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservations_tentes (reservation_id, zone_id, emplacement_numero, cin_sinistre, statut, date_reservation) FROM stdin;
\.


--
-- TOC entry 5145 (class 0 OID 16509)
-- Dependencies: 228
-- Data for Name: stocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stocks (stock_id, zone_id, type_ressource, quantite_disponible, seuil_alerte) FROM stdin;
9	8	tente	50000	1000
10	8	kit_medical	50000	1000
8	8	eau	49500	2000
11	9	eau	500	50
\.


--
-- TOC entry 5143 (class 0 OID 16488)
-- Dependencies: 226
-- Data for Name: utilisateurs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.utilisateurs (user_id, email, mot_de_passe_hash, mot_de_passe_salt, role, zone_id, nom) FROM stdin;
4	ahmed@safe-shelter.ma	$2b$10$qjiBVY8Jrplvu6OXWw/8bOvi9w7/LxC1xD1AzRy1w5iu5CW/2o7z.	$2b$10$qjiBVY8Jrplvu6OXWw/8bO	admin	\N	\N
\.


--
-- TOC entry 5141 (class 0 OID 16473)
-- Dependencies: 224
-- Data for Name: zones_regroupement; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.zones_regroupement (zone_id, nom, capacite_max, occupation_actuelle, statut, date_creation, latitude, longitude, is_hub) FROM stdin;
8	Hopital AGADIR	100000	0	actif	2026-04-05 00:25:01.819976	30.43620500	-9.59074100	t
9	Stade Adrar	1000	0	actif	2026-04-05 00:27:16.757543	30.42713900	-9.54004500	f
\.


--
-- TOC entry 5168 (class 0 OID 0)
-- Dependencies: 235
-- Name: activity_logs_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.activity_logs_log_id_seq', 1, false);


--
-- TOC entry 5169 (class 0 OID 0)
-- Dependencies: 233
-- Name: audit_log_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_log_log_id_seq', 9, true);


--
-- TOC entry 5170 (class 0 OID 0)
-- Dependencies: 229
-- Name: distributions_distribution_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.distributions_distribution_id_seq', 102, true);


--
-- TOC entry 5171 (class 0 OID 0)
-- Dependencies: 231
-- Name: reservations_tentes_reservation_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reservations_tentes_reservation_id_seq', 18, true);


--
-- TOC entry 5172 (class 0 OID 0)
-- Dependencies: 227
-- Name: stocks_stock_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stocks_stock_id_seq', 11, true);


--
-- TOC entry 5173 (class 0 OID 0)
-- Dependencies: 225
-- Name: utilisateurs_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.utilisateurs_user_id_seq', 4, true);


--
-- TOC entry 5174 (class 0 OID 0)
-- Dependencies: 223
-- Name: zones_regroupement_zone_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.zones_regroupement_zone_id_seq', 9, true);


--
-- TOC entry 4982 (class 2606 OID 16620)
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (log_id);


--
-- TOC entry 4980 (class 2606 OID 16576)
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (log_id);


--
-- TOC entry 4975 (class 2606 OID 16536)
-- Name: distributions distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_pkey PRIMARY KEY (distribution_id);


--
-- TOC entry 4978 (class 2606 OID 16559)
-- Name: reservations_tentes reservations_tentes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations_tentes
    ADD CONSTRAINT reservations_tentes_pkey PRIMARY KEY (reservation_id);


--
-- TOC entry 4973 (class 2606 OID 16520)
-- Name: stocks stocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stocks
    ADD CONSTRAINT stocks_pkey PRIMARY KEY (stock_id);


--
-- TOC entry 4969 (class 2606 OID 16502)
-- Name: utilisateurs utilisateurs_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_email_key UNIQUE (email);


--
-- TOC entry 4971 (class 2606 OID 16500)
-- Name: utilisateurs utilisateurs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4967 (class 2606 OID 16486)
-- Name: zones_regroupement zones_regroupement_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.zones_regroupement
    ADD CONSTRAINT zones_regroupement_pkey PRIMARY KEY (zone_id);


--
-- TOC entry 4976 (class 1259 OID 16565)
-- Name: idx_tente_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_tente_active ON public.reservations_tentes USING btree (zone_id, emplacement_numero) WHERE ((statut)::text = 'active'::text);


--
-- TOC entry 4989 (class 2620 OID 16578)
-- Name: distributions trg_apres_distribution; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_apres_distribution BEFORE INSERT ON public.distributions FOR EACH ROW EXECUTE FUNCTION public.fn_gestion_distributions();


--
-- TOC entry 4988 (class 2620 OID 16582)
-- Name: zones_regroupement trg_audit_zones; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_audit_zones AFTER UPDATE ON public.zones_regroupement FOR EACH ROW EXECUTE FUNCTION public.fn_audit_zones();


--
-- TOC entry 4990 (class 2620 OID 16580)
-- Name: reservations_tentes trg_update_occupation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_update_occupation AFTER INSERT OR UPDATE ON public.reservations_tentes FOR EACH ROW EXECUTE FUNCTION public.fn_update_occupation();


--
-- TOC entry 4985 (class 2606 OID 16590)
-- Name: distributions distributions_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.stocks(stock_id) ON DELETE CASCADE;


--
-- TOC entry 4986 (class 2606 OID 16542)
-- Name: distributions distributions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distributions
    ADD CONSTRAINT distributions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.utilisateurs(user_id);


--
-- TOC entry 4987 (class 2606 OID 16605)
-- Name: reservations_tentes reservations_tentes_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservations_tentes
    ADD CONSTRAINT reservations_tentes_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones_regroupement(zone_id) ON DELETE CASCADE;


--
-- TOC entry 4984 (class 2606 OID 16595)
-- Name: stocks stocks_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stocks
    ADD CONSTRAINT stocks_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones_regroupement(zone_id) ON DELETE CASCADE;


--
-- TOC entry 4983 (class 2606 OID 16600)
-- Name: utilisateurs utilisateurs_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones_regroupement(zone_id) ON DELETE SET NULL;


-- Completed on 2026-04-06 18:35:18

--
-- PostgreSQL database dump complete
--

\unrestrict CuFG6ZubSSQ2d31oigwLwbgMAFqHjmB77nhCQRtQWGSqNxbZPPzgRhZWcwg21rH

