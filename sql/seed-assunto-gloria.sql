insert into assuntos_discipulado (
  id,
  titulo,
  pregador,
  youtube_video_id,
  modulos,
  ativo,
  payload
)
values (
  'aumentando-niveis-de-gloria-apostolo-jean',
  'Aumentando os Níveis de Glória - Apóstolo Jean',
  'Apóstolo Jean',
  null,
  $$
  [
    {
      "id": "modulo-1",
      "number": 1,
      "title": "Resgatados de uma Maneira Vã de Viver",
      "timeLabel": "24:58 a 33:23",
      "start": 1498,
      "end": 2003,
      "videoId": "",
      "videoUrl": "",
      "questions": [
        {
          "id": "1.1",
          "title": "Pergunta 1.1",
          "text": "O Apóstolo ensina que fomos resgatados de uma \"vã maneira de viver\" herdada por tradição. Identifique: que hábitos, mentalidades ou tradições da sua família/passado você sente que ainda tenta arrastar para a sua vida cristã?"
        },
        {
          "id": "1.2",
          "title": "Pergunta 1.2",
          "text": "Com suas palavras, o que muda na sua rotina quando você entende que foi comprado por um preço precioso e não pertence mais a si mesmo?"
        }
      ]
    },
    {
      "id": "modulo-2",
      "number": 2,
      "title": "O que é a Glória de Deus?",
      "timeLabel": "38:51 a 44:28",
      "start": 2331,
      "end": 2668,
      "videoId": "",
      "videoUrl": "",
      "questions": [
        {
          "id": "2.1",
          "title": "Pergunta 2.1",
          "text": "De acordo com o texto de Êxodo 33 citado na pregação, o que é biblicamente a \"Glória de Deus\"?"
        },
        {
          "id": "2.2",
          "title": "Pergunta 2.2",
          "text": "Olhando para o seu dia a dia (na sua casa, no seu trabalho e com seus amigos), as pessoas têm conseguido enxergar a \"face de Deus\" nas suas atitudes?"
        }
      ]
    },
    {
      "id": "modulo-3",
      "number": 3,
      "title": "A Transferência da Glória",
      "timeLabel": "44:28 a 55:27",
      "start": 2668,
      "end": 3327,
      "videoId": "",
      "videoUrl": "",
      "questions": [
        {
          "id": "3.1",
          "title": "Pergunta 3.1",
          "text": "No vídeo, o Apóstolo faz uma dinâmica com a igreja. Como a glória do Pai chega até nós hoje?"
        },
        {
          "id": "3.2",
          "title": "Pergunta 3.2",
          "text": "Jesus orou para que fôssemos UM para manifestar essa glória. Você tem trabalhado em unidade com a liderança e equipe, ou tem tido a tendência de agir de forma isolada?"
        }
      ]
    },
    {
      "id": "modulo-4",
      "number": 4,
      "title": "Como Aumentar os Níveis de Glória",
      "timeLabel": "56:43 a 1:13:40",
      "start": 3403,
      "end": 4420,
      "videoId": "",
      "videoUrl": "",
      "questions": [
        {
          "id": "4.1",
          "title": "Pergunta 4.1",
          "text": "Segundo João 15:8, de que maneira prática a Igreja devolve a glória para o Pai?"
        },
        {
          "id": "4.2",
          "title": "Pergunta 4.2 (Diagnóstico)",
          "text": "O que significa \"dar frutos\" na sua vida hoje? Onde você sente que tem dado frutos e em qual área sente que precisa frutificar mais?"
        },
        {
          "id": "4.3",
          "title": "Pergunta 4.3 (Bloqueios)",
          "text": "O que tem sido o principal \"bloqueio\" ou desculpa que tem impedido você de dar frutos em um novo nível hoje? (Ex: cansaço, tempo, medo, falta de foco, etc.)"
        }
      ]
    },
    {
      "id": "modulo-5",
      "number": 5,
      "title": "Arrependimento e Desentupindo o Canal",
      "timeLabel": "1:14:02 a 1:38:05",
      "start": 4442,
      "end": 5885,
      "videoId": "",
      "videoUrl": "",
      "questions": [
        {
          "id": "5.1",
          "title": "Pergunta 5.1",
          "text": "O Apóstolo ministrou sobre desentupir o canal para ser um rio de águas purificadoras. Que atitude, mudança de caráter ou confissão você precisa fazer hoje para alinhar sua rota com Deus?"
        },
        {
          "id": "5.2",
          "title": "Pergunta 5.2",
          "text": "Qual compromisso prático você assume com o Senhor e com a nossa igreja a partir desta semana para exercer sua liderança com excelência?"
        },
        {
          "id": "5.3",
          "title": "Pergunta 5.3 (Suporte Pastoral)",
          "text": "Como eu, como seu pastor, posso orar por você ou te apoiar de forma prática nesta nova fase?"
        }
      ]
    }
  ]
  $$::jsonb,
  true,
  '{}'::jsonb
)
on conflict (id) do update set
  titulo = excluded.titulo,
  pregador = excluded.pregador,
  youtube_video_id = excluded.youtube_video_id,
  modulos = excluded.modulos,
  ativo = true,
  updated_at = now();
